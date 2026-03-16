const { Pool } = require('pg');
const sharp = require('sharp');
const bwipjs = require('bwip-js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'id_card_system',
  user: 'postgres',
  password: 'Network_admin'
});

// Output directory for generated cards
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Logging helper
const log = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
};

// Generate barcode from card number
const generateBarcode = async (cardNumber) => {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: cardNumber,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
    });
    return png;
  } catch (error) {
    log(`Barcode generation failed: ${error.message}`, 'ERROR');
    throw error;
  }
};

// Generate ID card image
const generateCardImage = async (cardData) => {
  try {
    const {
      surname,
      other_names,
      matric_no,
      staff_id,
      faculty,
      department,
      level,
      hall,
      passport_photo,
      signature,
      card_number,
      session
    } = cardData;

    // Card dimensions (300 DPI for printing quality)
    const CARD_WIDTH = 1012; // 3.375 inches at 300 DPI
    const CARD_HEIGHT = 638; // 2.125 inches at 300 DPI

    // Generate barcode
    const barcodeBuffer = await generateBarcode(card_number || 'NO-NUMBER');

    // Resize passport photo
    let photoBuffer = null;
    if (passport_photo) {
      photoBuffer = await sharp(passport_photo)
        .resize(250, 300, { fit: 'cover' })
        .toBuffer();
    } else {
      // Create placeholder if no photo
      photoBuffer = await sharp({
        create: {
          width: 250,
          height: 300,
          channels: 3,
          background: { r: 200, g: 200, b: 200 }
        }
      })
      .png()
      .toBuffer();
    }

    // Resize signature
    let signatureBuffer = null;
    if (signature) {
      signatureBuffer = await sharp(signature)
        .resize(200, 80, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .toBuffer();
    }

    // Resize barcode
    const resizedBarcode = await sharp(barcodeBuffer)
      .resize(300, 80, { fit: 'contain' })
      .toBuffer();

    // Create SVG layout for the card
    const cardSVG = `
    <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect width="100%" height="100%" fill="#ffffff"/>
      
      <!-- Header bar -->
      <rect x="0" y="0" width="${CARD_WIDTH}" height="100" fill="#1a1a2e"/>
      
      <!-- University name -->
      <text x="${CARD_WIDTH/2}" y="40" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">
        UNIVERSITY ID CARD
      </text>
      <text x="${CARD_WIDTH/2}" y="75" font-family="Arial, sans-serif" font-size="18" fill="#e0e0e0" text-anchor="middle">
        Management Information Systems
      </text>
      
      <!-- Photo placeholder (will be composited separately) -->
      <rect x="50" y="130" width="250" height="300" fill="#f0f0f0" stroke="#cccccc" stroke-width="2"/>
      
      <!-- Student details -->
      <text x="330" y="160" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#1a1a2e">
        ${surname.toUpperCase()}
      </text>
      <text x="330" y="190" font-family="Arial, sans-serif" font-size="20" fill="#333333">
        ${other_names}
      </text>
      
      <text x="330" y="240" font-family="Arial, sans-serif" font-size="16" fill="#666666">
        Matric No: <tspan font-weight="bold" fill="#1a1a2e">${matric_no || staff_id || 'N/A'}</tspan>
      </text>
      
      <text x="330" y="275" font-family="Arial, sans-serif" font-size="14" fill="#666666">
        Faculty: ${faculty || 'N/A'}
      </text>
      <text x="330" y="300" font-family="Arial, sans-serif" font-size="14" fill="#666666">
        Department: ${department || 'N/A'}
      </text>
      <text x="330" y="325" font-family="Arial, sans-serif" font-size="14" fill="#666666">
        Level: ${level || 'N/A'}
      </text>
      ${hall ? `<text x="330" y="350" font-family="Arial, sans-serif" font-size="14" fill="#666666">Hall: ${hall}</text>` : ''}
      
      <!-- Session -->
      <text x="330" y="390" font-family="Arial, sans-serif" font-size="13" fill="#888888">
        Session: ${session || 'N/A'}
      </text>
      
      <!-- Signature placeholder (will be composited separately) -->
      <rect x="330" y="420" width="200" height="80" fill="#ffffff" stroke="#cccccc" stroke-width="1"/>
      <text x="430" y="515" font-family="Arial, sans-serif" font-size="11" fill="#888888" text-anchor="middle">
        Signature
      </text>
      
      <!-- Footer with barcode placeholder -->
      <rect x="0" y="${CARD_HEIGHT - 100}" width="${CARD_WIDTH}" height="100" fill="#f8f8f8"/>
      
      <!-- Card number -->
      <text x="50" y="${CARD_HEIGHT - 70}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#1a1a2e">
        Card No: ${card_number || 'UNASSIGNED'}
      </text>
      
      <!-- Barcode placeholder (will be composited separately) -->
      <rect x="${CARD_WIDTH - 350}" y="${CARD_HEIGHT - 90}" width="300" height="80" fill="#ffffff"/>
    </svg>
    `;

    // Generate base card from SVG
    let cardImage = await sharp(Buffer.from(cardSVG))
      .png()
      .toBuffer();

    // Composite photo onto card
    cardImage = await sharp(cardImage)
      .composite([
        {
          input: photoBuffer,
          top: 130,
          left: 50
        }
      ])
      .toBuffer();

    // Composite signature if available
    if (signatureBuffer) {
      cardImage = await sharp(cardImage)
        .composite([
          {
            input: signatureBuffer,
            top: 420,
            left: 330
          }
        ])
        .toBuffer();
    }

    // Composite barcode
    cardImage = await sharp(cardImage)
      .composite([
        {
          input: resizedBarcode,
          top: CARD_HEIGHT - 90,
          left: CARD_WIDTH - 350
        }
      ])
      .png()
      .toBuffer();

    return cardImage;
  } catch (error) {
    log(`Card image generation failed: ${error.message}`, 'ERROR');
    throw error;
  }
};

// Send to printer
const sendToPrinter = (filePath, printerName = null) => {
  return new Promise((resolve, reject) => {
    // Windows printing command
    const command = printerName 
      ? `rundll32 printui.dll,PrintUIEntry /k /n "${printerName}" /f "${filePath}"`
      : `rundll32 shimgvw.dll,ImageView_PrintTo /pt "${filePath}"`;

    // For Linux/Mac, use lp command:
    // const command = printerName 
    //   ? `lp -d ${printerName} "${filePath}"`
    //   : `lp "${filePath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        log(`Print command failed: ${error.message}`, 'ERROR');
        reject(error);
      } else {
        log(`Print job sent successfully: ${filePath}`, 'INFO');
        resolve(stdout);
      }
    });
  });
};

// Main processing function
const processApprovedCards = async () => {
  const client = await pool.connect();
  
  try {
    // Query for approved cards not yet printed
    const result = await client.query(`
      SELECT u.*, ed.card_number, ed.session
      FROM id_cards u
      LEFT JOIN excel_data ed ON u.excel_data_id = ed.id
      WHERE u.status = 'approved' AND u.printed_at IS NULL
      ORDER BY u.id
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      log('No cards ready for printing', 'INFO');
      return;
    }

    log(`Found ${result.rows.length} card(s) ready for printing`, 'INFO');

    for (const card of result.rows) {
      try {
        log(`Processing card for: ${card.surname} ${card.other_names} (ID: ${card.id})`, 'INFO');

        // Generate card image
        const cardImage = await generateCardImage(card);

        // Save to file
        const fileName = `card_${card.id}_${card.matric_no || card.staff_id || 'unknown'}.png`;
        const filePath = path.join(OUTPUT_DIR, fileName);
        
        await sharp(cardImage)
          .png()
          .toFile(filePath);

        log(`Card image saved: ${filePath}`, 'INFO');

        // Send to printer (comment out for testing without printer)
        try {
          await sendToPrinter(filePath);
          log(`Card printed successfully for ID: ${card.id}`, 'SUCCESS');
        } catch (printError) {
          log(`Print failed but image saved: ${printError.message}`, 'WARNING');
          // Continue even if print fails - image is saved
        }

        // Update database - mark as printed
        await client.query(
          'UPDATE id_cards SET printed_at = CURRENT_TIMESTAMP, status = $1 WHERE id = $2',
          ['printed', card.id]
        );

        // Log the print activity
        await client.query(
          'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
          [null, 'CARD_PRINTED', `Card printed for ${card.surname} ${card.other_names} (ID: ${card.id})`]
        );

        log(`Database updated for card ID: ${card.id}`, 'INFO');

      } catch (cardError) {
        log(`Failed to process card ID ${card.id}: ${cardError.message}`, 'ERROR');
        
        // Mark as failed in database
        await client.query(
          'UPDATE id_cards SET status = $1 WHERE id = $2',
          ['print_failed', card.id]
        );
      }
    }

  } catch (error) {
    log(`Critical error in processing: ${error.message}`, 'ERROR');
    console.error(error);
  } finally {
    client.release();
  }
};

// Health check
const checkDatabaseConnection = async () => {
  try {
    await pool.query('SELECT 1');
    log('Database connection: OK', 'INFO');
    return true;
  } catch (error) {
    log(`Database connection failed: ${error.message}`, 'ERROR');
    return false;
  }
};

// Main loop
const startPrintingService = async () => {
  log('=== ID Card Printing Service Starting ===', 'INFO');
  log(`Output directory: ${OUTPUT_DIR}`, 'INFO');
  log(`Checking every 10 seconds for new approved cards...`, 'INFO');

  // Initial database check
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    log('Cannot start service - database connection failed', 'ERROR');
    process.exit(1);
  }

  // Process immediately on start
  await processApprovedCards();

  // Then check every 10 seconds
  setInterval(async () => {
    try {
      await processApprovedCards();
    } catch (error) {
      log(`Error in main loop: ${error.message}`, 'ERROR');
    }
  }, 10000); // 10 seconds
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log('Shutting down printing service...', 'INFO');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('Shutting down printing service...', 'INFO');
  await pool.end();
  process.exit(0);
});

// Catch unhandled errors
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'ERROR');
  console.error(error);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at: ${promise}, reason: ${reason}`, 'ERROR');
});

// Start the service
startPrintingService();