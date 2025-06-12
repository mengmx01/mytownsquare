const fs = require("fs");
const https = require("https");
// const http = require("http");
const WebSocket = require("ws");
const client = require("prom-client");
const path = require("path");
const sharp = require('sharp');

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

const lobby = [];

// messages to be sent to clients which need confirmation for successfully sent to client
const messageQueues = {}; // currently only stores direct messages
const sendIntervals = {};
function startSendQueue(channel, type) {
  if (sendIntervals[channel][type] != null) clearInterval(sendIntervals[channel][type]);
  sendIntervals[channel][type] = setInterval(() => {
    if (!messageQueues[channel]) return;
    if (!messageQueues[channel][type]) return;

    for (let i=0; i<messageQueues[channel][type].length; i++) {
      const key = Object.keys(messageQueues[channel][type][i])[0];
      for (let client of channels[channel]) {
        if ((client.playerRole === key || client.playerId === key) && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(messageQueues[channel][type][i][key]));
          break;
        }
      }
    }
  }, 1000 * 3)
}

function stopSendQueue(channel, type) {
  if (!sendIntervals[channel]) return;
  if (!sendIntervals[channel][type]) return;
  clearInterval(sendIntervals[channel][type]);
  sendIntervals[channel][type] = null;
}

// unique messages received to avoid sending multiple times to client
const messageUniques = {};

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


// a new client connects
wss.on("connection", function connection(ws, req) {
  console.log(new Date(), "new connection established! ==========================");
  console.log("requesting from IP " + (req.headers['x-forwarded-for'] || req.connection.remoteAddress));
  console.log("requesting from origin " + req.headers.origin);
  // url pattern: botcgrimoire.top/ws/<channel>/<playerId>(/<host>)
  // or: botcgrimoire.top/ws/lobby
  const url = req.url.toLocaleLowerCase().split("/");
  ws.playerId = url.pop();

  if (ws.playerId === "lobby") {
    if (lobby.length > 0) {
      ws.send(JSON.stringify("connectionFailed", ("lobby已被占用！")));
      return ws.terminate();
    } else {
      ws.send(JSON.stringify(["setRooms", Object.keys(channels)]));
      ws.playerRole = "lobby";
      lobby.push(ws);
    }
  } else {
    // handle if not lobby
    if (ws.playerId === "host") {
      ws.playerId = url.pop();
      ws.playerRole = "host";
    } else {
      ws.playerRole = "player";
    }
    
    ws.channel = url.pop();
    console.log("requesting for channel " + ws.channel + " from player " + ws.playerId);
    ws.playerIp = req.connection.remoteAddress.split(", ")[0];
    // check for another host on this channel
    if (
      ws.playerRole === "host" &&
      channels[ws.channel] &&
      channels[ws.channel].some(
        client =>
          client !== ws &&
          client.readyState === WebSocket.OPEN &&
          (client.playerRole === "host" || client.playerRole === "_host")
      )
    ) {
      const playerId = [];
      const playerIdHost = [];
      channels[ws.channel].forEach(client => {
        if (
          client !== ws &&
          client.readyState === WebSocket.OPEN &&
          (client.playerRole === "host" || client.playerRole === "_host")
        ) {
          playerId.push(client.playerId);
          if (client.playerRole === "host") {
            playerIdHost.push(client.playerId);
          }
        }
      });
      
      // if (!playerId.includes(ws.playerId)) {
      //   console.log(ws.channel, "duplicate host");
      //   ws.close(1000, `房间"${ws.channel}"已经存在说书人！`);
      //   metrics.connection_terminated_host.inc();
      //   return;
      // } else if (playerIdHost.includes(ws.playerId)) {
      if (playerIdHost.includes(ws.playerId)) {
        console.log(ws.channel, "duplicate entry");
        ws.send(JSON.stringify(["alertPopup", "检测到多个说书人网页，请检查并关闭多余的页面！"]));
      }
    }
    // if (ws.playerRole != "host" && !channels[ws.channel]) {
    //   ws.close(1000, `房间"${ws.channel}"不存在！`)
    //   return;
    // }
    // add channel to list
    // also create message lists for the channel
    if (ws.channel != "" && !channels[ws.channel]) {
      channels[ws.channel] = [];
      if (lobby.length > 0) lobby[0].send(JSON.stringify(["addRoom", ws.channel]));

      messageQueues[ws.channel] = {direct: []}; // currently only stores direct messages
      sendIntervals[ws.channel] = {direct: null};
      messageUniques[ws.channel] = [];
    }
    channels[ws.channel].push(ws);
    // 说书人重连后删除 _host 标签
    if (ws.playerRole === 'host') {
      channels[ws.channel] = channels[ws.channel].filter(session => session.playerRole != "_host");
    }
  }
  
  ws.isAlive = true;
  ws.pingStart = new Date().getTime();
  ws.counter = 0;
  console.log("connected client player ID ---------------------------")
  if (channels[ws.channel]) {
    channels[ws.channel].forEach(client => {
      console.log(client.playerId + "     " + client.playerRole);
    });
  }
  console.log("end --------------------------------------------------")
  console.log(Object.keys(channels));
  // start ping pong
  ws.ping(noop);
  ws.on("pong", heartbeat);
  // handle message
  ws.on("message", function incoming(data) {
    if (ws.playerRole != "lobby" && Object.keys(messageUniques[ws.channel]).includes(data)) {
      clearTimeout(messageUniques[ws.channel][data].timeout);
      messageUniques[ws.channel][data].timeout = setTimeout(() => {
        if (!messageUniques[ws.channel]) return;
        if (!messageUniques[ws.channel][data]) return;
        delete messageUniques[ws.channel][data];
      }, 3 * 60 * 1000);
    };
    metrics.messages_incoming.inc();
    // check rate limit (max 5msg/second)
    ws.counter++;
    if (ws.counter > (5 * sendIntervals) / 1000) {
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
      case '"ping"': {
        ws.send(JSON.stringify(["pong"]));
        // ping messages will only be sent host -> all or all -> host
        channels[ws.channel].forEach(function each(client) {
          if (
            client !== ws &&
            client.readyState === WebSocket.OPEN &&
            (ws.playerRole === "host" || client.playerRole === "host")
          ) {
            client.send(
              data.replace(/latency/, (client.latency || 0) + (ws.latency || 0))
            );
            metrics.messages_outgoing.inc();
          }
        });
        break;
      }
      case '"request"': {
        // console.log(
        //   new Date(),
        //   wss.clients.size,
        //   ws.channel,
        //   ws.playerId,
        //   data
        // );
        const feedback = JSON.parse(data).pop();
        if (feedback) {
          ws.send(JSON.stringify(["feedback", feedback]));
          if (ws.playerRole != "lobby" && !messageUniques[ws.channel].includes(data)) messageUniques[ws.channel].push(data);
        }

        const command = Object.keys(JSON.parse(data)[1])[0];
        const [playerId, params] = JSON.parse(data)[1][command];
        switch (command) {
          case "checkAllowHost":
            for (let i=0; i<channels[ws.channel].length; i++) {
              if (
                (channels[ws.channel][i].playerRole === "host" || channels[ws.channel][i].playerRole === "_host") &&
                playerId != channels[ws.channel][i].playerId
              ) {
                ws.send(JSON.stringify(["allowHost", false]));
                break;
              } else if (i + 1 === channels[ws.channel].length) {
                ws.send(JSON.stringify(["allowHost", true]));
              }
            }
            break;
          case "checkAllowJoin":
            for (let i=0; i<channels[ws.channel].length; i++) {
              if (
                // channels[ws.channel][i].readyState === WebSocket.OPEN &&
                (channels[ws.channel][i].playerRole === "host" || channels[ws.channel][i].playerRole === "_host")
              ) {
                ws.send(JSON.stringify(["allowJoin", true]));
                break;
              } else if (i + 1 === channels[ws.channel].length) {
                ws.send(JSON.stringify(["allowJoin", false]));
              }
            }
            break;
          case "deleteMessage":
            const type = params[0];
            if (!messageQueues[ws.channel][type]) return;
            if (messageQueues[ws.channel][type].length === 0) return;
            const id = params[1];
            for(let i=0; i<messageQueues[ws.channel][type].length; i++) {
              if (Object.values(messageQueues[ws.channel][type][i])[0][2] === id) {//检测feedback id是否相同，后期队列扩充可能需要优化
                messageQueues[ws.channel][type].splice(i, 1)
              }
              break;
            }
            if (messageQueues[ws.channel][type].length === 0) {
              clearInterval(sendIntervals[ws.channel][type]);
              sendIntervals[ws.channel][type] = null;
            }
            break;
        }
        break;
      }
      case '"direct"': {
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
          const feedback = JSON.parse(data)[2];
          if (feedback) {
            ws.send(JSON.stringify(["feedback", feedback]));
            if (Object.keys(messageUniques[ws.channel]).includes(data)) return;
            messageUniques[ws.channel][data] = {timeout: null};
            messageUniques[ws.channel][data].timeout = setTimeout(() => {
              if (!messageUniques[ws.channel]) return;
              if (!messageUniques[ws.channel][data]) return;
              delete messageUniques[ws.channel][data];
            }, 1 * 60 * 1000) // delete duplicates after 1 minute
            const player = Object.keys(dataToPlayer)[0];
            dataToPlayer[player].push(feedback);
            messageQueues[ws.channel].direct.push(dataToPlayer);
            startSendQueue(ws.channel, 'direct');
          }

          channels[ws.channel].forEach(function each(client) {
            if (
              client !== ws &&
              client.readyState === WebSocket.OPEN &&
              !!(dataToPlayer[client.playerId] || dataToPlayer[client.playerRole])
            ) {
              client.send(JSON.stringify(dataToPlayer[client.playerRole === "host" ? "host" : client.playerId]));
              metrics.messages_outgoing.inc();
            }
          });
        } catch (e) {
          console.log("error parsing direct message JSON", e);
        }
        break;
      }
      case '"uploadfile"': {
        try {
          const feedback = JSON.parse(data).pop();
          if (feedback) {
            ws.send(JSON.stringify(["feedback", feedback]));
            if (!messageUniques[ws.channel].includes(data)) messageUniques[ws.channel].push(data);
          }

          const uploadData = JSON.parse(data)[1];
          const uploadType = Object.keys(uploadData)[0];
          const playerId = Object.values(uploadData)[0][0];
          const uploadContent = Object.values(uploadData)[0][1];
          
          switch(uploadType) {
            case "uploadAvatar":
              // const extension = uploadContent.split(";base64,")[0].split("/").pop();
              const extension = 'webp';
              const avatarData = uploadContent.split(";base64,").pop();
              const version = new Date().getTime();
              // const folderPath = path.join(__dirname, "avatars");
              const folderPath = "/usr/share/nginx/html/dist/avatars";
              if (!fs.existsSync(folderPath)){
                  fs.mkdirSync(folderPath);
              }
              const fileName = playerId + "." + extension;
              const filePath = path.join(folderPath, fileName);
              sharp(Buffer.from(avatarData, 'base64'))
                .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }) // Resize to fit within 512x512, transparent background
                .toFormat('webp') // Convert to WebP format
                .toBuffer((err, buffer, info) => {
                  if (err) {
                    console.error('Failed to process image:', err);
                    return;
                  }
                  // Create an empty 512x512 image to use as the base
                  sharp({
                    create: {
                      width: 512,
                      height: 512,
                      channels: 4, // Ensure alpha channel for transparency
                      background: { r: 0, g: 0, b: 0, alpha: 0 }
                    }
                  })
                  .composite([{ input: buffer, gravity: 'center' }]) // Composite the resized image onto the center
                  .toFormat('webp') // Convert to WebP format
                  .toFile(filePath, (err, info) => {
                    if (err) {
                      console.error('Failed to save image:', err);
                    } else {
                      channels[ws.channel].forEach(function each(client) {
                        const fileLink = fileName + "?v=" + version;
                        if (client === ws && client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify(["avatarReceived", fileLink]));
                          metrics.messages_outgoing.inc();
                        }
                      });
                    }
                  });
                });
              break;
          }
        } catch (e) {
          console.log("error receiving uploaded file!", e);
        }
        break;
      }
      default: {
        // all other messages
        // console.log(
        //   new Date(),
        //   wss.clients.size,
        //   ws.channel,
        //   ws.playerId,
        //   data
        // );
        const feedback = JSON.parse(data).pop();
        if (feedback && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(["feedback", feedback]));
          if (!messageUniques[ws.channel].includes(data)) messageUniques[ws.channel].push(data);
        }
        channels[ws.channel].forEach(function each(client) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(data);
            metrics.messages_outgoing.inc();
          }
        });
        break;
      }
    }
  });
  ws.on("close", (code, reason) => {
    // 删除房间中断线的连接，以更好处理重复的说书人
    let close = false;
    let isLobby = false;
    if (code === 1000) {
      // 如果正常退出（解散）房间，正常删除记录
      console.log("client " + ws.playerId + "(" + ws.playerRole + ") is disconnecting from channel " + ws.channel + " ! Code: " + code + " Reason: 正常" + (ws.playerRole === "host" ? "解散" : "退出") + reason); 
      close = true;
    } else if (code === 1001 || code === 1006) {
      // 如果说书人因为刷新、关闭或者网络波动断连，加入角色为_host的伪连接以保证房间不被移除
      console.log("client " + ws.playerId + "(" + ws.playerRole + ") is disconnecting from channel " + ws.channel + " ! Code: " + code + " Reason: " + (code === 1001 ? "刷新或关闭" : "网络波动")); 
      if (ws.playerRole === "host") {
        let count = 0;
        for (let client of channels[ws.channel]) {
          if (client.playerRole === "host") count = count + 1;
          if (count > 1) break;
        }
        // 只在最后一个说书人断连时加入_host
        if (count === 1) {
          const wsHost = JSON.parse(JSON.stringify(ws));
          wsHost.playerRole = "_host";
          channels[ws.channel].push(wsHost);
        }
      } else if (ws.playerRole === "lobby") {
        isLobby = true;
      }
      close = true;
    }
    if (isLobby) {
      lobby.splice(0, 1);
    } else {
      if (close) { // 断连的同时移除连接（1000 1001 1006）
        // 每次断连只删除一个
        const firstConnection = channels[ws.channel].filter(client => client.playerId === ws.playerId && client.playerRole != "_host")[0];
        const index = channels[ws.channel].indexOf(firstConnection);
        channels[ws.channel].splice(index, 1);
        // channels[ws.channel] = channels[ws.channel].filter(client => {
        //   if (client.playerId === ws.playerId && !removed) {
        //     removed = true;
        //     return false;
        //   }
        //   return true;
        // });
      }

      if (Object.keys(channels[ws.channel]).length == 0) {
        delete channels[ws.channel];
        if (lobby.length > 0) lobby[0].send(JSON.stringify(["removeRoom", ws.channel]))
        Object.keys(sendIntervals[ws.channel]).forEach(type => {
          stopSendQueue(ws.channel, type);
        })
        delete sendIntervals[ws.channels];
        delete messageQueues[ws.channel];
        Object.keys(messageUniques[ws.channel]).forEach(data => {
          clearTimeout(messageUniques[ws.channel][data].timeout);
        })
        delete messageUniques[ws.channel];
      }
    }
    
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
const channelsInterval = setInterval(function ping() {
  // clean up empty channels
  for (let channel in channels) {
    if (
      !channels[channel].length // ||
      // !channels[channel].some(
      //   ws =>
      //     ws &&
      //     (ws.readyState === WebSocket.OPEN ||
      //       ws.readyState === WebSocket.CONNECTING)
      // )
    ) {
      metrics.channels_list.remove({ name: channel });
      delete channels[channel];
    }
  }
}, CHANNELS_PING_INTERVAL);
// handle server shutdown
wss.on("close", function close() {
  clearInterval(playersInterval);
  clearInterval(channelsInterval)
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
