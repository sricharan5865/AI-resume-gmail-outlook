import fetch from 'node-fetch';

fetch('http://localhost:11434/api/tags')
  .then(res => res.json())
  .then(data => {
    console.log('Ollama is running! Models:', data.models.map(m => m.name));
  })
  .catch(err => {
    console.log('Ollama is NOT running:', err.message);
  });
