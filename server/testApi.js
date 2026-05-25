import dotenv from 'dotenv';
dotenv.config();

// Simple test to see if the emails API works
async function testApi() {
  console.log('Testing TalentFlow APIs...\n');
  
  // Test auth
  const authRes = await fetch('http://localhost:5000/api/auth/status');
  const authData = await authRes.json();
  console.log('Auth Status:', JSON.stringify(authData, null, 2));
  
  // Test emails
  console.log('\nFetching emails from IMAP...');
  const emailsRes = await fetch('http://localhost:5000/api/gmail/emails');
  const emailsData = await emailsRes.json();
  
  console.log(`\nEmails found: ${emailsData.emails?.length || 0}`);
  
  if (emailsData.emails && emailsData.emails.length > 0) {
    emailsData.emails.forEach((email, i) => {
      console.log(`\n--- Email ${i + 1} ---`);
      console.log(`  Subject: ${email.subject}`);
      console.log(`  From: ${email.from}`);
      console.log(`  Date: ${email.date}`);
      console.log(`  Attachments: ${email.attachments?.length || 0}`);
      if (email.attachments && email.attachments.length > 0) {
        email.attachments.forEach(att => {
          console.log(`    📎 ${att.filename} (${att.size} bytes) [ID: ${att.attachmentId}]`);
        });
      }
    });
  } else {
    console.log('No emails with PDF attachments found.');
  }
  
  // Test jobs
  const jobsRes = await fetch('http://localhost:5000/api/jobs');
  const jobsData = await jobsRes.json();
  console.log(`\nJobs found: ${jobsData.length}`);
  jobsData.forEach(j => console.log(`  - ${j.title} (${j.id})`));
}

testApi().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
