import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import PDFDocument from 'pdfkit';
import { Writable } from 'stream';

dotenv.config();

/**
 * Create a PDF resume buffer in memory using pdfkit.
 */
function createResumePDF() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    
    // Collect chunks
    const writable = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      }
    });

    writable.on('finish', () => {
      resolve(Buffer.concat(chunks));
    });

    writable.on('error', reject);
    doc.pipe(writable);

    // --- Resume Content ---
    doc.fontSize(24).font('Helvetica-Bold').text('Rajesh Kumar Sharma', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica')
      .text('Email: rajesh.sharma@example.com | Phone: +91-9876543210', { align: 'center' });
    doc.text('Location: Hyderabad, Telangana, India', { align: 'center' });
    doc.moveDown(0.5);

    // Horizontal line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#6366f1');
    doc.moveDown(0.5);

    // Professional Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Professional Summary');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica')
      .text('Full-stack software engineer with 4+ years of experience in building high-performance web applications using React, Node.js, and cloud technologies. Passionate about clean code architecture, scalable microservices, and delivering exceptional user experiences. Led multiple agile teams and delivered projects on time for Fortune 500 clients.');
    doc.moveDown(0.5);

    // Skills
    doc.fontSize(14).font('Helvetica-Bold').text('Technical Skills');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text('Languages: JavaScript, TypeScript, Python, Java, SQL, HTML5, CSS3');
    doc.text('Frontend: React.js, Next.js, Redux, Tailwind CSS, Material UI, Vue.js');
    doc.text('Backend: Node.js, Express.js, Django, Spring Boot, GraphQL, REST APIs');
    doc.text('Databases: PostgreSQL, MongoDB, Redis, MySQL, Firebase Firestore');
    doc.text('Cloud & DevOps: AWS (EC2, S3, Lambda), Docker, Kubernetes, CI/CD, GitHub Actions');
    doc.text('Tools: Git, Jira, Figma, Postman, VS Code, Jenkins');
    doc.moveDown(0.5);

    // Experience
    doc.fontSize(14).font('Helvetica-Bold').text('Work Experience');
    doc.moveDown(0.3);

    doc.fontSize(11).font('Helvetica-Bold').text('Senior Software Engineer - Infosys Ltd.');
    doc.fontSize(9).font('Helvetica').fillColor('#666666').text('Jan 2022 - Present | Hyderabad, India');
    doc.fillColor('#000000');
    doc.fontSize(10).font('Helvetica');
    doc.text('• Led a team of 6 engineers to build a real-time analytics dashboard serving 50K+ daily users');
    doc.text('• Architected microservices backend with Node.js and Express handling 10M+ API requests/day');
    doc.text('• Reduced page load time by 40% through code splitting, lazy loading, and CDN optimization');
    doc.text('• Implemented CI/CD pipelines using GitHub Actions, reducing deployment time by 60%');
    doc.moveDown(0.4);

    doc.fontSize(11).font('Helvetica-Bold').text('Software Developer - TCS (Tata Consultancy Services)');
    doc.fontSize(9).font('Helvetica').fillColor('#666666').text('Jun 2020 - Dec 2021 | Bangalore, India');
    doc.fillColor('#000000');
    doc.fontSize(10).font('Helvetica');
    doc.text('• Developed responsive SPAs using React and Redux for a banking client portal');
    doc.text('• Built RESTful APIs with Spring Boot and integrated PostgreSQL databases');
    doc.text('• Collaborated with UX designers to implement pixel-perfect, accessible interfaces');
    doc.text('• Wrote unit and integration tests achieving 90%+ code coverage');
    doc.moveDown(0.4);

    doc.fontSize(11).font('Helvetica-Bold').text('Junior Developer Intern - Wipro Technologies');
    doc.fontSize(9).font('Helvetica').fillColor('#666666').text('Jan 2020 - May 2020 | Hyderabad, India');
    doc.fillColor('#000000');
    doc.fontSize(10).font('Helvetica');
    doc.text('• Assisted in developing internal tools using Python and Django');
    doc.text('• Created automated testing scripts reducing QA time by 30%');
    doc.moveDown(0.5);

    // Education
    doc.fontSize(14).font('Helvetica-Bold').text('Education');
    doc.moveDown(0.3);

    doc.fontSize(11).font('Helvetica-Bold').text('B.Tech in Computer Science & Engineering');
    doc.fontSize(10).font('Helvetica').text('JNTU Hyderabad - Graduated May 2020 - CGPA: 8.7/10');
    doc.moveDown(0.5);

    // Certifications
    doc.fontSize(14).font('Helvetica-Bold').text('Certifications');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text('• AWS Certified Solutions Architect - Associate (2023)');
    doc.text('• Google Cloud Professional Cloud Developer (2022)');
    doc.text('• Meta Front-End Developer Professional Certificate (2021)');

    doc.end();
  });
}

async function sendTestEmail() {
  console.log('\n========================================');
  console.log(' TalentFlow - Test Email Sender');
  console.log('========================================\n');

  const userEmail = process.env.GMAIL_USER_EMAIL;
  const appPassword = process.env.GMAIL_APP_PASSWORD;

  if (!userEmail || !appPassword) {
    console.error('ERROR: GMAIL_USER_EMAIL or GMAIL_APP_PASSWORD not set in .env');
    process.exit(1);
  }

  console.log(`[1/3] Generating PDF resume for test candidate "Rajesh Kumar Sharma"...`);
  const pdfBuffer = await createResumePDF();
  console.log(`      PDF generated successfully (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

  console.log(`[2/3] Connecting to Gmail SMTP (${userEmail})...`);
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: userEmail,
      pass: appPassword
    }
  });

  const mailOptions = {
    from: `"Rajesh Kumar Sharma" <${userEmail}>`,
    to: userEmail,
    subject: 'Application for React Frontend Developer Position - Rajesh Kumar Sharma',
    text: `Dear Hiring Manager,

I am writing to express my strong interest in the React Frontend Developer position at your organization. With over 4 years of experience in full-stack development, specializing in React.js, Node.js, and cloud technologies, I believe I would be a valuable addition to your engineering team.

I have attached my resume for your review. I look forward to the opportunity to discuss how my skills and experience align with your requirements.

Best regards,
Rajesh Kumar Sharma
+91-9876543210
rajesh.sharma@example.com`,
    attachments: [
      {
        filename: 'Rajesh_Kumar_Sharma_Resume.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  };

  console.log(`[3/3] Sending email to ${userEmail}...`);
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`\n✅ SUCCESS! Email sent successfully.`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Accepted: ${info.accepted.join(', ')}`);
    console.log(`\n   The email with PDF resume attachment should appear`);
    console.log(`   in the TalentFlow Gmail Sourcing Queue shortly.\n`);
  } catch (error) {
    console.error(`\n❌ FAILED to send email:`, error.message);
    process.exit(1);
  }
}

sendTestEmail();
