// inspectTopdesk.js
require('dotenv').config();
const { URL } = require('url');
const https = require('https');

const BASE_URL = process.env.TOPDESK_URL;
const USERNAME = process.env.TOPDESK_USERNAME;
const PASSWORD = process.env.TOPDESK_APP_PASSWORD;

const url = new URL('/tas/api/operatorChanges?pageSize=3', BASE_URL);
const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

const agent = new https.Agent({ rejectUnauthorized: false });

https.get({
  hostname: url.hostname,
  path: url.pathname + url.search,
  headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
  agent,
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('Status HTTP:', res.statusCode);
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log(data.slice(0, 500));
    }
  });
}).on('error', console.error);