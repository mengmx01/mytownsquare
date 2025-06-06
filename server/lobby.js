const fs = require("fs");
// const https = require("https");
const http = require("http");
const WebSocket = require("ws");
const client = require("prom-client");
const path = require("path");
const sharp = require('sharp');
const { nextTick } = require("process");

// Create a Registry which registers the metrics
const register = new client.Registry();
// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: "clocktower-online"
});

// const PLAYERS_PING_INTERVAL = 1000 * 60 * 60 * 8; // 8 hours
const PLAYERS_PING_INTERVAL = 1000 * 60 * 3; // 3 minutes
const CHANNELS_PING_INTERVAL = 1000 * 60 * 60 * 8; // 8 hours

const options = {};
if (process.env.NODE_ENV !== "development") {
  options.cert = fs.readFileSync("cert.pem");
  options.key = fs.readFileSync("key.pem");
}

// const server = https.createServer(options);
const server = http.createServer(options);

const skipVerification = true;

const wss = skipVerification ?
new WebSocket.Server({ server }) :
new WebSocket.Server({
  ...(process.env.NODE_ENV === "development" ? { port: 8082 } : { server }),
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

async function fetchKook(link, params) {
    console.log('called')
    const data = await fetch(link, params);
    console.log(data);
    return data;
}

// let a = (fetchKook("https://www.kookapp.cn/api/v3/channel-user/get-joined-channel?guild_id=6845926251568838&user_id=1445394033", {
//                     method: "GET",
//                     headers: {
//                         "Authorization": "Bot 1/MzcwNjI=/Jd+QZymLy3oSRy0m7DCNPg==",
//                         "Content-Type": "application/json"
//                     }
//                 }))
// await Promise.resolve();
// console.log(a);

    
//     async () => {
// 
//     }
    


// map of channels currently in use
const clients = [];


// a new client connects
wss.on("connection", function connection(ws, req) {
  // url pattern: clocktower.online/<channel>/<playerId|host>
  const url = req.url.toLocaleLowerCase().split("/");
  ws.playerId = url.pop();
  
  ws.playerIp = req.connection.remoteAddress.split(", ")[0];
  ws.isAlive = true;
  ws.pingStart = new Date().getTime();
  ws.counter = 0;
  
  ws.ping(noop);
  ws.on("pong", heartbeat);
  // handle message
  ws.on("message", async function incoming(data) {
    // if (Object.keys(messageUniques[ws.channel]).includes(data)) {
    //   clearTimeout(messageUniques[ws.channel][data].timeout);
    //   messageUniques[ws.channel][data].timeout = setTimeout(() => {
    //     if (!messageUniques[ws.channel]) return;
    //     if (!messageUniques[ws.channel][data]) return;
    //     delete messageUniques[ws.channel][data];
    //   }, 3 * 60 * 1000);
    // };
    // metrics.messages_incoming.inc();
    // // check rate limit (max 5msg/second)
    // ws.counter++;
    // if (ws.counter > (5 * sendIntervals) / 1000) {
    //   console.log(ws.channel, "disconnecting user due to spam");
    //   ws.close(
    //     1000,
    //     "Your app seems to be malfunctioning, please clear your browser cache."
    //   );
    //   metrics.connection_terminated_spam.inc();
    //   return;
    // }
    const messageType = data
      .toLocaleLowerCase()
      .substr(1)
      .split(",", 1)
      .pop();
    switch (messageType) {
    //   case '"ping"': {
    //     ws.send(JSON.stringify(["pong"]));
    //     // ping messages will only be sent host -> all or all -> host
    //     channels[ws.channel].forEach(function each(client) {
    //       if (
    //         client !== ws &&
    //         client.readyState === WebSocket.OPEN &&
    //         (ws.playerRole === "host" || client.playerRole === "host")
    //       ) {
    //         client.send(
    //           data.replace(/latency/, (client.latency || 0) + (ws.latency || 0))
    //         );
    //         metrics.messages_outgoing.inc();
    //       }
    //     });
    //     break;
    //   }
      case '"request"': {
        // console.log(
        //   new Date(),
        //   wss.clients.size,
        //   ws.channel,
        //   ws.playerId,
        //   data
        // );
        const command = Object.keys(JSON.parse(data)[1])[0];
        const [playerId, params] = JSON.parse(data)[1][command];
        switch (command) {
            case "kookConnection":
                ws.kookId = params.kookId
                console.log(params.connected);
                if (params.connected) return;
                let key = 0;
                while (key < 100000) {
                    key = Math.floor(Math.random() * 1000000);
                } 
                fetch("https://www.kookapp.cn/api/v3/direct-message/create", {
                    method: "POST",
                    headers: {
                        "Authorization": "Bot 1/MzcwNjI=/Jd+QZymLy3oSRy0m7DCNPg==",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        target_id: params.kookId,
                        content: "魔典正在尝试绑定KOOK，如果是本人操作请输入以下验证码：" + key
                    })
                })
                ws.kookKey = String(key);
                if (ws.kookKeyTimeout) {
                    clearTimeout(ws.kookKeyTimeout);
                    ws.kookKeyTimeout = null;
                }
                ws.kookKeyTimeout = setTimeout(() => {
                    ws.kookKey = null;
                    ws.kookKeyTimeout = null;
                }, 1000 * 60 * 5)
                break;
            case "enterKookKey":
                console.log(ws.kookKey);
                console.log(ws.kookKeyTimeout);
                if (params === ws.kookKey && playerId === ws.playerId) {
                    clearTimeout(ws.kookKeyTimeout);
                    ws.kookKeyTimeout = null;
                    ws.send(JSON.stringify(["kookConnected", true]));
                } else {
                    ws.send(JSON.stringify(["kookConnected", false]));
                }
                break;
        //   case "checkDuplicateHost":
        //     for (let i=0; i<channels[ws.channel].length; i++) {
        //       if (
        //         channels[ws.channel][i].readyState === WebSocket.OPEN &&
        //         (channels[ws.channel][i].playerRole === "host" || channels[ws.channel][i].playerRole === "_host") &&
        //         playerId != channels[ws.channel][i].playerId
        //       ) {
        //         ws.send(JSON.stringify(["duplicatedHost", true]));
        //         break;
        //       } else if (i + 1 === channels[ws.channel].length) {
        //         ws.send(JSON.stringify(["duplicatedHost", false]));
        //       }
        //     }
        //     break;
        //   case "checkExistChannel":
        //     for (let i=0; i<channels[ws.channel].length; i++) {
        //       if (
        //         // channels[ws.channel][i].readyState === WebSocket.OPEN &&
        //         (channels[ws.channel][i].playerRole === "host" || channels[ws.channel][i].playerRole === "_host")
        //       ) {
        //         ws.send(JSON.stringify(["existingChannel", true]));
        //         break;
        //       } else if (i + 1 === channels[ws.channel].length) {
        //         ws.send(JSON.stringify(["existingChannel", false]));
        //       }
        //     }
        //     break;
        //   case "deleteMessage":
        //     const type = params[0];
        //     if (!messageQueues[ws.channel][type]) return;
        //     if (messageQueues[ws.channel][type].length === 0) return;
        //     const id = params[1];
        //     for(let i=0; i<messageQueues[ws.channel][type].length; i++) {
        //       if (Object.values(messageQueues[ws.channel][type][i])[0][2] === id) {//检测feedback id是否相同，后期队列扩充可能需要优化
        //         messageQueues[ws.channel][type].splice(i, 1)
        //       }
        //       break;
        //     }
        }
        break;
      }
    //   case '"direct"': {
    //     // handle "direct" messages differently
    //     // console.log(
    //     //   new Date(),
    //     //   wss.clients.size,
    //     //   ws.channel,
    //     //   ws.playerId,
    //     //   data
    //     // );
    //     try {
    //       const dataToPlayer = JSON.parse(data)[1];
    //       const feedback = JSON.parse(data)[2];
    //       if (feedback) {
    //         ws.send(JSON.stringify(["feedback", feedback]));
    //         if (Object.keys(messageUniques[ws.channel]).includes(data)) return;
    //         messageUniques[ws.channel][data] = {timeout: null};
    //         messageUniques[ws.channel][data].timeout = setTimeout(() => {
    //           if (!messageUniques[ws.channel]) return;
    //           if (!messageUniques[ws.channel][data]) return;
    //           delete messageUniques[ws.channel][data];
    //         }, 1 * 60 * 1000) // delete duplicates after 1 minute
    //         const player = Object.keys(dataToPlayer)[0];
    //         dataToPlayer[player].push(feedback);
    //         messageQueues[ws.channel].direct.push(dataToPlayer);
    //         startSendQueue(ws.channel, 'direct');
    //       }

    //       channels[ws.channel].forEach(function each(client) {
    //         if (
    //           client !== ws &&
    //           client.readyState === WebSocket.OPEN &&
    //           !!(dataToPlayer[client.playerId] || dataToPlayer[client.playerRole])
    //         ) {
    //           client.send(JSON.stringify(dataToPlayer[client.playerRole === "host" ? "host" : client.playerId]));
    //           metrics.messages_outgoing.inc();
    //         }
    //       });
    //     } catch (e) {
    //       console.log("error parsing direct message JSON", e);
    //     }
    //     break;
    //   }
    //   case '"uploadfile"': {
    //     try {
    //       const feedback = JSON.parse(data).pop();
    //       if (feedback) {
    //         ws.send(JSON.stringify(["feedback", feedback]));
    //         if (!messageUniques[ws.channel].includes(data)) messageUniques[ws.channel].push(data);
    //       }

    //       const uploadData = JSON.parse(data)[1];
    //       const uploadType = Object.keys(uploadData)[0];
    //       const playerId = Object.values(uploadData)[0][0];
    //       const uploadContent = Object.values(uploadData)[0][1];
          
    //       switch(uploadType) {
    //         case "uploadAvatar":
    //           // const extension = uploadContent.split(";base64,")[0].split("/").pop();
    //           const extension = 'webp';
    //           const avatarData = uploadContent.split(";base64,").pop();
    //           const version = new Date().getTime();
    //           // const folderPath = path.join(__dirname, "avatars");
    //           const folderPath = "/usr/share/nginx/html/dist/avatars";
    //           if (!fs.existsSync(folderPath)){
    //               fs.mkdirSync(folderPath);
    //           }
    //           const fileName = playerId + "." + extension;
    //           const filePath = path.join(folderPath, fileName);
    //           sharp(Buffer.from(avatarData, 'base64'))
    //             .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }) // Resize to fit within 512x512, transparent background
    //             .toFormat('webp') // Convert to WebP format
    //             .toBuffer((err, buffer, info) => {
    //               if (err) {
    //                 console.error('Failed to process image:', err);
    //                 return;
    //               }
    //               // Create an empty 512x512 image to use as the base
    //               sharp({
    //                 create: {
    //                   width: 512,
    //                   height: 512,
    //                   channels: 4, // Ensure alpha channel for transparency
    //                   background: { r: 0, g: 0, b: 0, alpha: 0 }
    //                 }
    //               })
    //               .composite([{ input: buffer, gravity: 'center' }]) // Composite the resized image onto the center
    //               .toFormat('webp') // Convert to WebP format
    //               .toFile(filePath, (err, info) => {
    //                 if (err) {
    //                   console.error('Failed to save image:', err);
    //                 } else {
    //                   channels[ws.channel].forEach(function each(client) {
    //                     const fileLink = fileName + "?v=" + version;
    //                     if (client === ws && client.readyState === WebSocket.OPEN) {
    //                       client.send(JSON.stringify(["avatarReceived", fileLink]));
    //                       metrics.messages_outgoing.inc();
    //                     }
    //                   });
    //                 }
    //               });
    //             });
    //           break;
    //       }
    //     } catch (e) {
    //       console.log("error receiving uploaded file!", e);
    //     }
    //     break;
    //   }
    //   default: {
    //     // all other messages
    //     // console.log(
    //     //   new Date(),
    //     //   wss.clients.size,
    //     //   ws.channel,
    //     //   ws.playerId,
    //     //   data
    //     // );
    //     const feedback = JSON.parse(data).pop();
    //     if (feedback && ws.readyState === WebSocket.OPEN) {
    //       ws.send(JSON.stringify(["feedback", feedback]));
    //       if (!messageUniques[ws.channel].includes(data)) messageUniques[ws.channel].push(data);
    //     }
    //     channels[ws.channel].forEach(function each(client) {
    //       if (client !== ws && client.readyState === WebSocket.OPEN) {
    //         client.send(data);
    //         metrics.messages_outgoing.inc();
    //       }
    //     });
    //     break;
    //   }
    }
  });
  ws.on("close", (code, reason) => {
    // // 删除房间中断线的连接，以更好处理重复的说书人
    // let close = false;
    // if (code === 1000) {
    //   // 如果正常退出（解散）房间，正常删除记录
    //   close = true;
    // } else if (code === 1001 || code === 1006) {
    //   // 如果说书人因为刷新、关闭或者网络波动断连，加入角色为_host的伪连接以保证房间不被移除
    //   if (ws.playerRole === "host") {
    //     let count = 0;
    //     for (let client of channels[ws.channel]) {
    //       if (client.playerRole === "host") count = count + 1;
    //       if (count > 1) break;
    //     }
    //     // 只在最后一个说书人断连时加入_host
    //     if (count === 1) {
    //       const wsHost = JSON.parse(JSON.stringify(ws));
    //       wsHost.playerRole = "_host";
    //       channels[ws.channel].push(wsHost);
    //     }
    //   }
    //   close = true;
    // }

    // if (close) { // 断连的同时移除连接（1000 1001 1006）
    //   // 每次断连只删除一个
    //   const firstConnection = channels[ws.channel].filter(client => client.playerId === ws.playerId && client.playerRole != "_host")[0];
    //   const index = channels[ws.channel].indexOf(firstConnection);
    //   channels[ws.channel].splice(index, 1);
    //   // channels[ws.channel] = channels[ws.channel].filter(client => {
    //   //   if (client.playerId === ws.playerId && !removed) {
    //   //     removed = true;
    //   //     return false;
    //   //   }
    //   //   return true;
    //   // });
    // }

    // if (Object.keys(channels[ws.channel]).length == 0) {
    //   delete channels[ws.channel];
    //   Object.keys(sendIntervals[ws.channel]).forEach(type => {
    //     stopSendQueue(ws.channel, type);
    //   })
    //   delete sendIntervals[ws.channels];
    //   delete messageQueues[ws.channel];
    //   Object.keys(messageUniques[ws.channel]).forEach(data => {
    //     clearTimeout(messageUniques[ws.channel][data].timeout);
    //   })
    //   delete messageUniques[ws.channel];
    // }
  })
});

// start ping interval timer
const playersInterval = setInterval(function ping() {
  // ping each client
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      metrics.connection_terminated_timeout.inc();
      // return ws.terminate();
    } else {
      ws.send(JSON.stringify(["pong"]));
    }
    ws.isAlive = false;
    ws.pingStart = new Date().getTime();
    ws.ping(noop);
  });
}, PLAYERS_PING_INTERVAL);
// const channelsInterval = setInterval(function ping() {
//   // clean up empty channels
//   for (let channel in channels) {
//     if (
//       !channels[channel].length // ||
//       // !channels[channel].some(
//       //   ws =>
//       //     ws &&
//       //     (ws.readyState === WebSocket.OPEN ||
//       //       ws.readyState === WebSocket.CONNECTING)
//       // )
//     ) {
//       metrics.channels_list.remove({ name: channel });
//       delete channels[channel];
//     }
//   }
// }, CHANNELS_PING_INTERVAL);
// handle server shutdown
wss.on("close", function close() {
  clearInterval(playersInterval);
  clearInterval(channelsInterval)
});

// prod mode with stats API
if (process.env.NODE_ENV !== "development") {
  server.listen(8082, () => { //http port
  // server.listen(8443, () => { //https port
    console.log("Socket is running on port 8082");
  });
  server.on("request", (req, res) => {
    res.setHeader("Content-Type", register.contentType);
    // register.metrics().then(out => res.end(out));
  });
}

async function kookGateway() {
    const response = await fetch("https://www.kookapp.cn/api/v3/gateway/index",{
        method: "GET",
        headers: {
            "Authorization": "Bot 1/MzcwNjI=/Jd+QZymLy3oSRy0m7DCNPg==",
            "Content-Type": "application/json"
        }
    })
    const data = await response.json();
    return data.data.url;
}

async function connectToKook() {

    const wss = await kookGateway();

    kookSocket = new WebSocket(wss);
    kookSocket.onopen = () => {
        console.log('Welcome!');
    }
    kookSocket.onmessage = (event) => {
        console.log(event);
    }
    kookSocket.onclose = () => {
        console.log('Closing!');
    }
}

let kookSocket;
connectToKook();

console.log("server started");
