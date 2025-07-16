const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const moment = require('moment');
const path = require('path');

// Design System Configuration
const designSystem = {
  colors: {
    primary: '#2d3748',
    secondary: '#4a5568',
    accent: '#2b6cb0',
    background: '#f8f9fa',
    border: '#e2e8f0',
    lightGray: '#f7fafc'
  },
  typography: {
    header1: { size: 18, font: 'Helvetica-Bold' },
    header2: { size: 14, font: 'Helvetica-Bold' },
    body: { size: 10, font: 'Helvetica' },
    caption: { size: 8, font: 'Helvetica-Oblique' }
  },
  spacing: {
    headerMargin: 25,
    sectionMargin: 20,
    elementSpacing: 10,
    lineSpacing: 18
  },
  borders: {
    thin: { width: 0.5, color: '#e2e8f0' },
    thick: { width: 1.2, color: '#2d3748' }
  }
};



// Assets Configuration
const assets = {
  logo: path.join(__dirname, '../public/logo.jpg'),
  qrSize: 100,
  barcode: { width: 220, height: 30 }
};

async function generateReceiptPDF(saleData) {
  // Validate input
  if (!saleData?.receiptId) throw new Error('Missing receipt ID');
  if (!saleData?.items?.length) throw new Error('No items in sale');
  
  // Initialize PDF Document
  const doc = new PDFDocument({ 
    margin: 40,
    size: 'A4',
    bufferPages: true,
    font: designSystem.typography.body.font
  });

  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));

  return new Promise(async (resolve, reject) => {
    try {
      // Generate QR and Barcode early to handle async operations
      const [qrImage, barcodeImage] = await Promise.all([
        QRCode.toBuffer(JSON.stringify({
          receiptId: saleData.receiptId,
          date: moment(saleData.saleDate).format('YYYY-MM-DD HH:mm'),
          items: saleData.items,
          total: saleData.total,
          cashier: saleData.userName,
          paymentMethod: saleData.paymentMethod
        }), { errorCorrectionLevel: 'H', width: assets.qrSize, margin: 1 }),
        
        bwipjs.toBuffer({
          bcid: 'code128',
          text: saleData.receiptId.toString(),
          scale: 1.2,
          height: 25,
          includetext: false
        })
      ]);

      // Document Sections
      await drawHeaderSection(doc, saleData);
      drawMetaSection(doc, saleData);
      drawItemsTable(doc, saleData);
      drawTotalsSection(doc, saleData);
      await drawFooterSection(doc, saleData, qrImage, barcodeImage);

      doc.end();
      doc.on('end', () => resolve(Buffer.concat(buffers)));
    } catch (error) {
      reject(error);
    }
  });
}

// Header Section
async function drawHeaderSection(doc, saleData) {
  try {
    doc.image(assets.logo, 50, 25, { width: 60 });
  } catch (err) {
    console.error('Logo not found:', assets.logo);
  }

  doc.fontSize(8)
     .fillColor(designSystem.colors.secondary)
     .text('Where Creativity Meets Innovation', 50, 90);

  doc.fillColor(designSystem.colors.primary)
     .font(designSystem.typography.header1.font)
     .fontSize(designSystem.typography.header1.size)
     .text('WELT TALLIS GROUP', 350, 35, { align: 'right' })
     .font(designSystem.typography.body.font)
     .fontSize(designSystem.typography.body.size)
     .text('Nairobi, Kenya', 350, 60, { align: 'right' })
     .text('infowelttallis@gmail.com', 350, 75, { align: 'right' })
     .text('Tel: +254740045355', 350, 90, { align: 'right' });

  doc.moveTo(50, 110)
     .lineTo(550, 110)
     .lineWidth(designSystem.borders.thick.width)
     .strokeColor(designSystem.colors.accent)
     .stroke();
}

// Meta Information Section
function drawMetaSection(doc, saleData) {
  const metaTop = 125;
  const metaPositions = [50, 200, 350, 470];
  const metaData = [
    { label: 'Receipt No', value: saleData.receiptId },
    { label: 'Date', value: moment(saleData.saleDate).format('DD MMM YYYY HH:mm') },
    { label: 'Cashier', value: saleData.userName || 'Welt Admin' },
    { label: 'Payment Method', value: saleData.paymentMethod.toUpperCase() }
  ];

  metaData.forEach((item, index) => {
    doc.font('Helvetica-Bold')
       .fontSize(10)
       .fillColor(designSystem.colors.secondary)
       .text(`${item.label}:`, metaPositions[index], metaTop)
       .font('Helvetica')
       .fillColor(designSystem.colors.primary)
       .text(item.value, metaPositions[index] + 60, metaTop);
  });
}

// Items Table Section
function drawItemsTable(doc, saleData) {
  const tableTop = 175;
  const columns = [
    { label: 'Item', x: 50, width: 280, align: 'left' },
    { label: 'QTY', x: 350, width: 60, align: 'right' },
    { label: 'Price', x: 410, width: 70, align: 'right' },
    { label: 'Total', x: 480, width: 70, align: 'right' }
  ];

  // Table Header
  doc.fillColor(designSystem.colors.accent)
     .font('Helvetica-Bold')
     .fontSize(10);
  columns.forEach(col => {
    doc.text(col.label, col.x, tableTop, { width: col.width, align: col.align });
  });
  doc.moveTo(50, tableTop + 12)
     .lineTo(550, tableTop + 12)
     .lineWidth(designSystem.borders.thin.width)
     .strokeColor(designSystem.colors.border)
     .stroke();

  // Table Rows
  let currentY = tableTop + 20;
  saleData.items.forEach(item => {
    const price = Number(item.price || 0);
    const quantity = Number(item.quantity || item.qty || 0);
    const total = price * quantity;

    doc.font('Helvetica')
       .fontSize(10)
       .fillColor(designSystem.colors.primary)
       .text(item.name || 'Unknown Item', columns[0].x, currentY, { 
         width: columns[0].width, 
         align: columns[0].align 
       })
       .text(quantity.toString(), columns[1].x, currentY, { 
         width: columns[1].width, 
         align: columns[1].align 
       })
       .text(`Ksh ${price.toLocaleString()}`, columns[2].x, currentY, { 
         width: columns[2].width, 
         align: columns[2].align 
       })
       .text(`Ksh ${total.toLocaleString()}`, columns[3].x, currentY, { 
         width: columns[3].width, 
         align: columns[3].align 
       });

    currentY += designSystem.spacing.lineSpacing;
  });
}

// Totals Section
function drawTotalsSection(doc, saleData) {
  const totalY = doc.y + 20;
  const totalAmount = Number(saleData.total || 0).toLocaleString();

  doc.moveTo(410, totalY)
     .lineTo(550, totalY)
     .strokeColor(designSystem.colors.accent)
     .lineWidth(designSystem.borders.thick.width)
     .stroke();

  doc.font('Helvetica-Bold')
     .fontSize(12)
     .fillColor(designSystem.colors.accent)
     .text('TOTAL:', 410, totalY + 5, { align: 'right' })
     .text(`Ksh ${totalAmount}`, 480, totalY + 5, { align: 'right' });
}

// Footer Section
async function drawFooterSection(doc, saleData, qrImage, barcodeImage) {
  const footerY = Math.min(doc.y + 40, 700);

  // Footer background
  doc.rect(0, footerY, 612, 80)
     .fillColor(designSystem.colors.lightGray)
     .fill();

  // Add images
  doc.image(qrImage, 50, footerY + 10, { width: assets.qrSize })
     .image(barcodeImage, 170, footerY + 15, { 
       width: assets.barcode.width, 
       height: assets.barcode.height 
     });

  // Footer text
  doc.fillColor(designSystem.colors.secondary)
     .fontSize(9)
     .text('SCAN QR CODE FOR DIGITAL RECEIPT', 50, footerY + 70, { 
       width: 120, 
       align: 'center' 
     })
     .fontSize(designSystem.typography.caption.size)
     .text('✉ infowelttallis@gmail.com   |   📞 +254740045355   |   🌐 www.welt-tallis-group.co.ke', 
       50, footerY + 60, { width: 500, align: 'center' })
     .text(`Valid until ${moment().add(1, 'year').format('YYYY')}`, 
       50, footerY + 75, { width: 500, align: 'center' });
}

module.exports = { generateReceiptPDF };