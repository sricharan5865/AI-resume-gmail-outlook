import fs from 'fs';

const log = fs.readFileSync('C:/Users/sri charan/.gemini/antigravity/brain/a120ab9e-2a7f-4dbb-b985-881a27ce967e/.system_generated/tasks/task-300.log', 'utf-8');
const lines = log.split('\n');
console.log('Lines containing upload:');
console.log(lines.filter(l => l.includes('upload') || l.includes('candidates')).slice(-50).join('\n'));
