import fetch from 'node-fetch';

async function test() {
  const urls = [
    'https://istgenai.smartgeoapps.com/api/tags',
    'https://istgenai.smartgeoapps.com/tags',
    'https://istgenai.smartgeoapps.com'
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`URL: ${url}`);
      console.log(`Status: ${res.status} ${res.statusText}`);
      console.log(`Content-type: ${res.headers.get('content-type')}`);
      console.log(`Body snippet: ${text.substring(0, 300)}`);
      console.log('----------------------------------------------------');
    } catch (e) {
      console.log(`URL: ${url} failed: ${e.message}`);
    }
  }
}

test();
