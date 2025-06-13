const fs = require("fs");
const https = require("https");
// const http = require("http");
const WebSocket = require("ws");
const client = require("prom-client");

// Create a Registry which registers the metrics
const register = new client.Registry();
// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: "clocktower-online"
});

// const PLAYERS_PING_INTERVAL = 1000 * 60 * 60 * 8; // 8 hours
const PLAYERS_PING_INTERVAL = 1000 * 60 * 3; // 3 minutes

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

// map of channels currently in use
let rooms = [];

// connection to backend
let connection = null;


class LiveSession {
  constructor() {
    // this._wss = "wss://botcgrimoire.top:443/ws/lobby";
    this._wss = "wss://localhost:8081/lobby"; // uncomment if using local server with NODE_ENV=development
    this._socket = null;
    this._isAlive = true;
    this._pingInterval = 3 * 1000; // 30 seconds between pings
    this._pingTimer = null;
    this._reconnectTimer = null;
  }

  _onOpen() {
    console.log('Connected to backend!');
  }

  _handleMessage({ data }) {
    let command, params;
    try {
      [command, params] = JSON.parse(data);
    } catch (err) {
      console.log("unsupported socket message", data);
    }
    switch (command) {
      case "connectionFailed":
        break;
      case "setRooms":
        this.setRooms(params);
        break;
      case "addRoom":
        this.addRoom(params);
        break;
      case "removeRoom":
        this.removeRoom(params);
        break;
    }
  }

  /**
   * Connect to a new live session to the lobby to receive information about available rooms.
   * Set a unique playerId if there isn't one yet.
   */
  connect() {
    this.disconnect();
    this._socket = new WebSocket(this._wss, {rejectUnauthorized: false});
    this._socket.addEventListener("message", this._handleMessage.bind(this));
    this._socket.onopen = this._onOpen.bind(this);
    this._socket.onclose = err => {
      this._socket = null;
      clearTimeout(this._pingTimer);
      this._pingTimer = null;
      if (err.code !== 1000) {
        // connection interrupted, reconnect after 3 seconds
        this._reconnectTimer = setTimeout(
          () => this.connect(),
          3 * 1000
        );
      }
    };
  }

  /**
   * Close the current session, if any.
   */
  disconnect() {
    clearTimeout(this._reconnectTimer);
    if (this._socket) {
      this._socket.close(1000);
      this._socket = null;
    }
  }

  /**
   * Set the full list of available rooms
   * @param params full list of all existing channels
   * @private
   */
  setRooms(params) {
    if (!Array.isArray(params)) return;
    rooms = params;
    console.log(rooms);
  }

  /**
   * Add rooms to the existing list
   * @param params full list of all existing channels
   * @private
   */
  addRoom(params) {
    if (typeof params != "string") return;
    if (rooms.includes(params)) return;
    rooms.push(params);
    console.log(rooms);
    wss.clients.forEach(function each(ws) {
      ws.send(JSON.stringify(["addRoom", params]));
    });
  }

  /**
   * Remove rooms from the existing list
   * @param params full list of all existing channels
   * @private
   */
  removeRoom(params) {
    if (typeof params != "string") return;
    rooms = rooms.filter(room => room != params);
    console.log(rooms);
    wss.clients.forEach(function each(ws) {
      ws.send(JSON.stringify(["removeRoom", params]));
    });
  }
}

if (connection === null) {
  connection = new LiveSession();
  connection.connect();
}

// a new client connects
wss.on("connection", function connection(ws, req) {
  // url pattern: clocktower.online/<channel>/<playerId|host>
  const url = req.url.toLocaleLowerCase().split("/");
  ws.playerId = url.pop();
  
  ws.playerIp = req.connection.remoteAddress.split(", ")[0];
  ws.isAlive = true;
  ws.pingStart = new Date().getTime();
  ws.counter = 0;

  ws.send(JSON.stringify(["setRooms", rooms]))
  
  ws.ping(noop);
  ws.on("pong", heartbeat);
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

console.log("server started");
