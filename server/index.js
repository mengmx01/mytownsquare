const fs = require("fs");
const https = require("https");
// const http = require("http");
const WebSocket = require("ws");
const client = require("prom-client");
const path = require("path");
const sharp = require('sharp');
const axios = require('axios');

// Create a Registry which registers the metrics
const register = new client.Registry();
// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: "clocktower-online"
});

const PING_INTERVAL = 1000 * 60 * 60 * 8; // 8 hours

const options = {};
console.log(process.env.NODE_ENV);
if (process.env.NODE_ENV !== "development") {
  options.cert = fs.readFileSync("cert.pem");
  options.key = fs.readFileSync("key.pem");
}

const server = https.createServer(options);
// const server = http.createServer(options);

const skipVerification = true;

const wss = skipVerification ?
new WebSocket.Server({ server }) :
new WebSocket.Server({
  ...(process.env.NODE_ENV === "development" ? { port: 8081 } : { server }),
  verifyClient: info => {
    info.origin &&
    !!info.origin.match(
      /^https?:\/\/([^.]+\.github\.io|localhost|clocktower\.online|eddbra1nprivatetownsquare\.xyz|botcgrimoire\.site|www\.botcgrimoire\.site|43\.139\.3\.156|58\.84\.180\.119|172\.68\.210\.101)/i
       // /^http?:\/\/([^.]+\.github\.io|localhost|clocktower\.online|eddbra1nprivatetownsquare\.xyz|botcgrimoire\.site|www\.botcgrimoire\.site|43\.139\.3\.156|58\.84\.180\.119|172\.68\.210\.101)/i
    )
  }
})

function noop() {}

// calculate latency on heartbeat
function heartbeat() {
  this.latency = Math.round((new Date().getTime() - this.pingStart) / 2);
  this.counter = 0;
  this.isAlive = true;
}

// map of channels currently in use
const channels = {};

// metrics
const metrics = {
  players_concurrent: new client.Gauge({
    name: "players_concurrent",
    help: "Concurrent Players",
    collect() {
      this.set(wss.clients.size);
    }
  }),
  channels_concurrent: new client.Gauge({
    name: "channels_concurrent",
    help: "Concurrent Channels",
    collect() {
      this.set(Object.keys(channels).length);
    }
  }),
  channels_list: new client.Gauge({
    name: "channel_players",
    help: "Players in each channel",
    labelNames: ["name"],
    collect() {
      for (let channel in channels) {
        this.set(
          { name: channel },
          channels[channel].filter(
            ws =>
              ws &&
              (ws.readyState === WebSocket.OPEN ||
                ws.readyState === WebSocket.CONNECTING)
          ).length
        );
      }
    }
  }),
  messages_incoming: new client.Counter({
    name: "messages_incoming",
    help: "Incoming messages"
  }),
  messages_outgoing: new client.Counter({
    name: "messages_outgoing",
    help: "Outgoing messages"
  }),
  connection_terminated_host: new client.Counter({
    name: "connection_terminated_host",
    help: "Terminated connection due to host already present"
  }),
  connection_terminated_spam: new client.Counter({
    name: "connection_terminated_spam",
    help: "Terminated connection due to message spam"
  }),
  connection_terminated_timeout: new client.Counter({
    name: "connection_terminated_timeout",
    help: "Terminated connection due to timeout"
  })
};

// register metrics
for (let metric in metrics) {
  register.registerMetric(metrics[metric]);
}
// Function to purge Nginx cache 
const purgeNginxCache = async (url) => { 
  try { 
    const response = await axios({ 
      method: 'PURGE', 
      url: url 
    }); 
    console.log(`Purge request to Nginx successful: ${response.status}`); 
  } catch (error) { 
    console.error(`Error purging Nginx cache: ${error.message}`); 
  } 
}; 

// Function to purge Cloudflare cache 
const purgeCloudflareCache = async (urls) => { 
  try { 
    const response = await axios({ 
      method: 'POST', 
      url: 'https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/purge_cache', 
      headers: { 
        'X-Auth-Email': 'YOUR_EMAIL', 
        'X-Auth-Key': 'YOUR_API_KEY', 
        'Content-Type': 'application/json' 
      }, 
      data: { 
        files: urls 
      } 
    }); 
    console.log(`Purge request to Cloudflare successful: ${response.data}`); 
  } catch (error) { 
    console.error(`Error purging Cloudflare cache: ${error.message}`); 
  } 
};
// a new client connects
wss.on("connection", function connection(ws, req) {
  // url pattern: clocktower.online/<channel>/<playerId|host>
  const url = req.url.toLocaleLowerCase().split("/");
  ws.playerId = url.pop();
  ws.channel = url.pop();
  // check for another host on this channel
  if (
    ws.playerId === "host" &&
    channels[ws.channel] &&
    channels[ws.channel].some(
      client =>
        client !== ws &&
        client.readyState === WebSocket.OPEN &&
        client.playerId === "host"
    )
  ) {
    console.log(ws.channel, "duplicate host");
    ws.close(1000, `房间"${ws.channel}"已经存在说书人！`);
    metrics.connection_terminated_host.inc();
    return;
  }
  if (ws.playerId != "host" && !channels[ws.channel]) {
    ws.close(1000, `房间"${ws.channel}"不存在！`)
  }
  ws.isAlive = true;
  ws.pingStart = new Date().getTime();
  ws.counter = 0;
  // add channel to list
  if (!channels[ws.channel]) {
    channels[ws.channel] = [];
  }
  channels[ws.channel].push(ws);
  // start ping pong
  ws.ping(noop);
  ws.on("pong", heartbeat);
  // handle message
  ws.on("message", function incoming(data) {
    metrics.messages_incoming.inc();
    // check rate limit (max 5msg/second)
    ws.counter++;
    if (ws.counter > (5 * PING_INTERVAL) / 1000) {
      console.log(ws.channel, "disconnecting user due to spam");
      ws.close(
        1000,
        "Your app seems to be malfunctioning, please clear your browser cache."
      );
      metrics.connection_terminated_spam.inc();
      return;
    }
    const messageType = data
      .toLocaleLowerCase()
      .substr(1)
      .split(",", 1)
      .pop();
    switch (messageType) {
      case '"ping"':
        // ping messages will only be sent host -> all or all -> host
        channels[ws.channel].forEach(function each(client) {
          if (
            client !== ws &&
            client.readyState === WebSocket.OPEN &&
            (ws.playerId === "host" || client.playerId === "host")
          ) {
            client.send(
              data.replace(/latency/, (client.latency || 0) + (ws.latency || 0))
            );
            metrics.messages_outgoing.inc();
          }
        });
        break;
      case '"direct"':
        // handle "direct" messages differently
        // console.log(
        //   new Date(),
        //   wss.clients.size,
        //   ws.channel,
        //   ws.playerId,
        //   data
        // );
        try {
          const dataToPlayer = JSON.parse(data)[1];
          channels[ws.channel].forEach(function each(client) {
            if (
              client !== ws &&
              client.readyState === WebSocket.OPEN &&
              dataToPlayer[client.playerId]
            ) {
              client.send(JSON.stringify(dataToPlayer[client.playerId]));
              metrics.messages_outgoing.inc();
            }
          });
        } catch (e) {
          console.log("error parsing direct message JSON", e);
        }
        break;
      case '"uploadfile"':
          try {
            const uploadData = JSON.parse(data)[1];
            const uploadType = Object.keys(uploadData)[0];
            const playerId = Object.values(uploadData)[0][0];
            const uploadContent = Object.values(uploadData)[0][1];
            
            switch(uploadType) {
              case "uploadProfileImage":
                // const extension = uploadContent.split(";base64,")[0].split("/").pop();
                const extension = 'webp';
                const profileImageData = uploadContent.split(";base64,").pop();
                // const folderPath = path.join(__dirname, "profile_images");
                const folderPath = "/usr/share/nginx/html/dist/profile_images";
                if (!fs.existsSync(folderPath)){
                    fs.mkdirSync(folderPath);
                }
                const fileName = playerId + "." + extension;
                const filePath = path.join(folderPath, fileName);
                // fs.writeFile(filePath, profileImageData, { encoding: 'base64' }, (err) => {
                //   if (err) {
                //     console.error('Failed to save image:', err);
                //   } else {
                //     channels[ws.channel].forEach(function each(client) {
                //       if (
                //         client === ws &&
                //         client.readyState === WebSocket.OPEN
                //       ) {
                //         client.send(JSON.stringify(["profileImageReceived", fileName]));
                //         metrics.messages_outgoing.inc();
                //       }
                //     });
                //   }
                // });
                sharp(Buffer.from(profileImageData, 'base64'))
                  .resize(512, 512) // Resize to 512x512 pixels
                  .toFormat('webp') // Convert to WebP format
                  .toFile(filePath, (err, info) => {
                    if (err) {
                        console.error('Failed to save image:', err);
                    } else {
                      channels[ws.channel].forEach(function each(client) {
                        if (client === ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(["profileImageReceived", fileName]));
                            metrics.messages_outgoing.inc();
                        }
                      });
                      purgeNginxCache(`http://botcgrimoire.site/profile_images/${fileName}`);
                      purgeCloudflareCache([`http://botcgrimoire.site/profile_images/${fileName}`]);
                    }
                  });
                break;
            }
          } catch (e) {
            console.log("error receiving uploaded file!", e);
          }
        // })
        break;
      default:
        // all other messages
        // console.log(
        //   new Date(),
        //   wss.clients.size,
        //   ws.channel,
        //   ws.playerId,
        //   data
        // );
        channels[ws.channel].forEach(function each(client) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(data);
            metrics.messages_outgoing.inc();
          }
        });
        break;
    }
  });
});

// start ping interval timer
const interval = setInterval(function ping() {
  // ping each client
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      metrics.connection_terminated_timeout.inc();
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.pingStart = new Date().getTime();
    ws.ping(noop);
  });
  // clean up empty channels
  for (let channel in channels) {
    if (
      !channels[channel].length ||
      !channels[channel].some(
        ws =>
          ws &&
          (ws.readyState === WebSocket.OPEN ||
            ws.readyState === WebSocket.CONNECTING)
      )
    ) {
      metrics.channels_list.remove({ name: channel });
      delete channels[channel];
    }
  }
}, PING_INTERVAL);
// handle server shutdown
wss.on("close", function close() {
  clearInterval(interval);
});

// prod mode with stats API
if (process.env.NODE_ENV !== "development") {
  server.listen(8081, () => { //http port
  // server.listen(8443, () => { //https port
    console.log("Socket is running on port 8081");
  });
  server.on("request", (req, res) => {
    res.setHeader("Content-Type", register.contentType);
    register.metrics().then(out => res.end(out));
  });
}

console.log("server started");
