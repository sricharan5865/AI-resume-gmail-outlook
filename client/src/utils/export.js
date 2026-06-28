/**
 * Exports data to a CSV file and triggers a browser download.
 * Handles escaping strings and lists of items (arrays).
 * 
 * @param {Array} data Array of objects containing the row data
 * @param {String} fileName Output file name without extension
 * @param {Object} headers Key-value map of header key to display column title
 */
export function exportToCSV(data, fileName, headers) {
  const headerKeys = Object.keys(headers);
  const csvRows = [];
  
  // 1. Add header row
  csvRows.push(headerKeys.map(key => `"${headers[key].replace(/"/g, '""')}"`).join(','));
  
  // 2. Add data rows
  for (const row of data) {
    const values = headerKeys.map(key => {
      // Handle nested properties (e.g. nested.key)
      let val = row;
      const keyParts = key.split('.');
      for (const part of keyParts) {
        if (val === null || val === undefined) {
          val = '';
          break;
        }
        val = val[part];
      }

      let valStr = '';
      if (val === null || val === undefined) {
        valStr = '';
      } else if (Array.isArray(val)) {
        // If it is an array of objects (like education/experience)
        if (val.length > 0 && typeof val[0] === 'object') {
          valStr = val.map(item => {
            return Object.entries(item)
              .filter(([k]) => k !== '_id')
              .map(([k, v]) => `${k}: ${v}`)
              .join(' | ');
          }).join('; ');
        } else {
          valStr = val.join('; ');
        }
      } else if (typeof val === 'object') {
        valStr = JSON.stringify(val);
      } else {
        valStr = String(val);
      }
      
      // Clean value to escape quotes and make CSV safe
      return `"${valStr.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }
  
  // Create Blob and trigger download (Excel safe UTF-8 BOM prefix)
  const blob = new Blob(["\uFEFF" + csvRows.join("\r\n")], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${fileName}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
