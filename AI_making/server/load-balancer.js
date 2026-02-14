const http = require('http');
const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer();
const workers = [3001, 3002, 3003, 3004].map(port => `http://localhost:${port}`);

let current = 0;
const server = http.createServer((req, res) => {
  proxy.web(req, res, { target: workers[current] });
  current = (current + 1) % workers.length;
});

server.listen(3000, () => console.log('Balancer on 3000'));