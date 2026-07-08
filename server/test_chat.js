import fetch from 'node-fetch';

async function testChat() {
  const url = 'https://istgenai.smartgeoapps.com/api/chat';
  const body = {
    model: 'gpt-oss:20b',
    messages: [
      { role: 'user', content: 'Hello, respond with hello and nothing else.' }
    ],
    stream: false
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log('Status:', res.status, res.statusText);
    console.log('Content-Type:', res.headers.get('content-type'));
    const text = await res.text();
    console.log('Response Snippet:', text.substring(0, 500));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

testChat();
