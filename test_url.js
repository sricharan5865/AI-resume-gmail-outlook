console.log('URL is:', typeof URL);
console.log('globalThis.URL is:', typeof globalThis.URL);
try {
  const u = new URL('http://localhost');
  console.log('Successfully created URL:', u.href);
} catch (e) {
  console.error('Failed to create URL:', e);
}
