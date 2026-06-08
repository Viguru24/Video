import http from 'http';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log("Connecting to Edge debugger...");
  try {
    const list = await getJson('http://127.0.0.1:9222/json/list');
    console.log("Pages list:", list);
    const page = list.find(p => p.url.includes('localhost:55174') || p.type === 'page');
    if (!page) {
      console.error("Could not find localhost page!");
      process.exit(1);
    }
    
    // We can also just print out the title and status of pages found
    console.log(`Target page found: "${page.title}" (${page.url})`);
    
    // Let's connect using standard WebSocket to listen to events
    import('ws').then(async ({ default: WebSocket }) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      
      ws.on('open', () => {
        console.log("Connected to WebSocket debugger.");
        // Enable Console and Runtime domains
        ws.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
      });
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Runtime.consoleAPICalled') {
          console.log("[BROWSER CONSOLE]", msg.params.args.map(a => a.value || a.description).join(' '));
        } else if (msg.method === 'Runtime.exceptionThrown') {
          console.error("[BROWSER ERROR]", msg.params.exceptionDetails.exception.description);
        }
      });
      
      setTimeout(() => {
        console.log("Finished monitoring. Closing browser test.");
        ws.close();
        process.exit(0);
      }, 5000);
    }).catch(err => {
      console.log("ws package not available. Checking page manually...");
      console.log("Page details:", page);
      process.exit(0);
    });
  } catch (err) {
    console.error("Failed to query Edge debugger:", err.message);
    process.exit(1);
  }
}

run();
