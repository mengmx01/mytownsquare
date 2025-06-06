class LiveSession {
  constructor(store) {
    // this._wss = "ws://43.139.3.156:8080/";
    this._wss = "wss://botcgrimoire.top:443/ws/";
    // this._wss = "wss://botcgrimoire.uk:8443/";
    // this._wss = "wss://botcgrimoire.top:8443/";
    // this._wss = "wss://live.clocktower.online:8080/";
    // this._wss = "ws://localhost:8081/"; // uncomment if using local server with NODE_ENV=development
    // this._wss = "ws://192.168.10.3:8081/";
    this._socket = null;
    this._isSpectator = true;
    this._isAlive = true;
    this._gamestate = [];
    this._store = store;
    this._pingInterval = 3 * 1000; // 30 seconds between pings
    this._pingTimer = null;
    this._sendInterval = 3 * 1000; // 3 seconds between unsent message cycles
    this._sendTimer = null;
    this._reconnectTimer = null;
    this._players = {}; // map of players connected to a session
    this._pings = {}; // map of player IDs to ping
    // reconnect to previous session
    if (this._store.state.session.sessionId) {
      this.connect(this._store.state.session.sessionId);
    }
  }

  /**
   * Open a new session for the passed channel.
   * @param channel
   * @private
   */
  _open(channel) {
    this.disconnect();
    this._socket = new WebSocket(
      this._wss +
        channel +
        "/" +
        this._store.state.session.playerId + 
        (!this._isSpectator ? "/host" : "")
    );
    this._socket.addEventListener("message", this._handleMessage.bind(this));
    this._socket.onopen = this._onOpen.bind(this);
    this._socket.onclose = err => {
      this._socket = null;
      clearTimeout(this._pingTimer);
      this._pingTimer = null;
      if (err.code !== 1000) {
        // connection interrupted, reconnect after 3 seconds
        this._store.commit("session/setReconnecting", true);
        this._reconnectTimer = setTimeout(
          () => this.connect(channel),
          3 * 1000
        );
      } else {
        this._store.commit("session/setSessionId", "");
        if (err.reason) alert(err.reason);
      }
    };
  }

  /**
   * Send a message through the socket.
   * @param command
   * @param params
   * @private
   */
  _send(command, params, feedback = false) {
    if (this._socket && this._socket.readyState === 1) {
      this._socket.send(JSON.stringify([command, params, feedback]));
    }
  }

  /**
   * Send a message directly to a single playerId, if provided.
   * Otherwise broadcast it.
   * @param playerId player ID or "host", optional
   * @param command
   * @param params
   * @private
   */
  _sendDirect(playerId, command, params, feedback = false) {
    if (playerId) {
      this._send("direct", { [playerId]: [command, params]}, feedback);
    } else {
      this._send(command, params, feedback);
    }
  }
  
  /**
   * Request some server side information.
   * @param playerId player ID or "host"
   * @param command
   * @param params
   * @private
   */
  _request(command, playerId, params, feedback = false) {
    this._send("request", { [command]: [playerId, params] }, feedback);
  }

  /**
   * Upload a file to the server (stored).
   * Currently only supports images for avatar pictures
   * @param playerId player ID or "host"
   * @param command
   * @param params
   * @private
   */
  _uploadFile(command, playerId, params, feedback = false) {
    if (playerId) {
      this._send("uploadFile", { [command]: [playerId, params] }, feedback);
    }
  }

  _sendQueue() {
      if (this._store.state.session.messageQueue.length <= 0) return;
      for (let message of this._store.state.session.messageQueue) {
        switch (message.type) {
          case "direct":
            this._sendDirect(message.playerId, message.command, message.params, message.id);
            break;
          case "request":
            this._request(message.command, message.playerId, message.params, message.id);
            break;
          case "uploadFile":
            this._uploadFile(message.command, message.playerId, message.params, message.id);
            break;
          default:
            this._send(message.command, message.params, message.id);
        }
      }
  }

  _startSendQueue() {
    this._stopSendQueue();
    this._sendQueue();
    this._sendTimer = setInterval(() => {
      this._sendQueue();
    }, this._sendInterval);
  }

  _stopSendQueue() {
    clearInterval(this._sendTimer);
    this._sendTimer = null;
  }

  /**
   * 
   * @param id id for identifying and deleting the query
   */
  _deleteFromQueue(id) {
    if (this._store.state.session.messageQueue.length <= 0) return;
    for (let i=0; i<this._store.state.session.messageQueue.length; i++) {
      if (this._store.state.session.messageQueue[i].id === id) {
        this._checkQueue(this._store.state.session.messageQueue[i]);
        // this._store.state.session.messageQueue.splice(i,1);
        this._store.commit("session/deleteMessageQueue", i)
        break;
      }
    }
  }

  /** 
   * 
   * @param message check the specific message and perform certain actions before deleting
   */
  _checkQueue(message) {
    switch (message.type) {
      case "direct": 
        switch (message.command) {
          case "chat": {
            const receivingPlayerId = message.params.receivingPlayerId === "host" ? this._store.state.session.stId : message.params.receivingPlayerId;
            this._store.commit("session/updateChatReceived", {message: message.params.message, playerId: receivingPlayerId}); // sending out to other players, receivingPlayerId is the recorded chat ID
          }
          break;
        }
        break;
    }
  }

  /**
   * Open event handler for socket.
   * @private
   */
  _onOpen() {
    if (this._isSpectator) {
      if (this._store.state.session.firstJoinCheck) {
        this.requestExistChannel();
      }
      this._sendDirect(
        "host",
        "getGamestate",
        this._store.state.session.playerId
      );
      this._sendDirect(
        "host",
        "getStId",
        this._store.state.session.playerId
      )
      if (this._store.state.session.claimedSeat >= 0 && !this._store.state.session.isListening && !this._store.state.session.isTalking) {
        this._store.commit("session/setTalking", {seatNum: this._store.state.session.claimedSeat, isTalking: false});
      }
    } else {
      if (this._store.state.session.firstHostCheck) {
        this.requestDuplicateHost();
      }
      this.sendGamestate();
    }
    this._ping();
  }

  /**
   * Send a ping message with player ID and ST flag.
   * @private
   */
  _ping() {
    this._handlePing();
    this._send("ping", [
      this._isSpectator
        ? this._store.state.session.playerId
        : Object.keys(this._players).length,
      "latency"
    ]);
    clearTimeout(this._pingTimer);
    this._pingTimer = setTimeout(this._ping.bind(this), this._pingInterval);
    // if (this._store.state.session.sessionId && 
    //   !this._isAlive && !this._store.state.session.isReconnecting
    // ) {
    //   this._isAlive = true;
    //   this.connect(this._store.state.session.sessionId);
    // }
    // this._isAlive = false;
  }

  /**
   * Handle an incoming socket message.
   * @param data
   * @private
   */
  _handleMessage({ data }) {
    let command, params, feedback;
    try {
      [command, params, feedback] = JSON.parse(data);
    } catch (err) {
      console.log("unsupported socket message", data);
    }
    switch (command) {
      case "alertPopup":
        alert(params);
        break;
      case "duplicatedHost":
        this._handleDuplicateHost(params);
        break;
      case "existingChannel":
        this._handleExistChannel(params);
        break;
      case "getGamestate":
        this.sendGamestate(params);
        break;
      case "getStId":
        this.sendStId(params);
        break;
      case "edition":
        this._updateEdition(params);
        break;
      case "fabled":
        this._updateFabled(params);
        break;
      case "gs":
        this._updateGamestate(params);
        break;
      case "stId":
        this._updateStId(params);
        break;
      case "player":
        this._updatePlayer(params);
        break;
      case "bluff":
        this._updateBluff(params);
        break;
      case "grimoire":
        this._updateGrimoire(params);
        break;
      case "claim":
        this._updateSeat(params);
        this._createChatHistory(params);
        break;
      case "leaveSeat":
        this._updateLeaveSeat();
        break;
      case "ping":
        this._handlePing(params);
        break;
      case "pong":
        this._handlePong(params);
        break;
      case "feedback":
        this._deleteFromQueue(params);
        break;
      case "nomination":
        if (!this._isSpectator) return;
        if (!params) {
          // create vote history record
          this._store.commit(
            "session/addHistory",
            this._store.state.players.players
          );
          this._store.commit("session/addVoteSelected", {selected: false, save: true});
        }
        this._store.commit("session/nomination", { nomination: params });
        break;
      case "swap":
        if (!this._isSpectator) return;
        this._store.commit("players/swap", params);
        break;
      case "move":
        if (!this._isSpectator) return;
        this._store.commit("players/move", params);
        break;
      case "remove":
        if (!this._isSpectator) return;
        this._store.commit("players/remove", params);
        break;
      case "marked":
        if (!this._isSpectator) return;
        this._store.commit("session/setMarkedPlayer", params);
        break;
      case "isNight":
        if (!this._isSpectator) return;
        this._store.commit("toggleNight", params);
        break;
      case "isVoteHistoryAllowed":
        if (!this._isSpectator) return;
        this._store.commit("session/setVoteHistoryAllowed", params);
        this._store.commit("session/clearVoteHistory");
        break;
      case "votingSpeed":
        if (!this._isSpectator) return;
        this._store.commit("session/setVotingSpeed", params);
        break;
      case "clearVoteHistory":
        if (!this._isSpectator) return;
        this._store.commit("session/clearVoteHistory");
        break;
      case "isVoteInProgress":
        if (!this._isSpectator) return;
        this._store.commit("session/setVoteInProgress", params);
        break;
      case "vote":
        this._handleVote(params);
        break;
      case "lock":
        this._handleLock(params);
        break;
      case "bye":
        this._handleBye(params);
        break;
      case "pronouns":
        this._updatePlayerPronouns(params);
        break;
      case "chat":
        this._handleChat(params, feedback);
        break;
      case "setTimer":
        this._handleSetTimer(params);
        break;
      case "startTimer":
        this._handleStartTimer(params);
        break;
      case "stopTimer":
        this._handleStopTimer(params);
        break;
      case "avatarReceived":
        this._avatarReceived(params);
        break;
      case "secretVote":
        this._handleSecretVote(params);
        break;
      case "bootlegger":
        this._handleSetBootlegger(params);
        break;
      case "useOldOrder":
        this._handleSetUseOldOrder(params);
        break;
      case "setTalking":
        this._handleSetTalking(params);
        break;
    }
  }

  /**
   * Connect to a new live session, either as host or spectator.
   * Set a unique playerId if there isn't one yet.
   * @param channel
   */
  connect(channel) {
    if (!this._store.state.session.playerId) {
      let playerId;
      // 禁止host、_host和player作为playerId
      while (!playerId || playerId === "host" || playerId === "_host" || playerId === "player" || playerId === "default") {
        playerId = Math.random().toString(36).substr(2);
      }
      this._store.commit(
        "session/setPlayerId",
        playerId
      );
    }
    this._pings = {};
    this._store.commit("session/setPlayerCount", 0);
    this._store.commit("session/setPing", 0);
    this._isSpectator = this._store.state.session.isSpectator;
    if (this._store.state.session.claimedSeat >= 0) {
      this._store.commit("session/setTalking", {seatNum: this._store.state.session.claimedSeat, isTalking: false});
    }
    this._open(channel);
  }

  /**
   * Close the current session, if any.
   */
  disconnect() {
    this._pings = {};
    this._store.commit("session/setPlayerCount", 0);
    this._store.commit("session/setPing", 0);
    this._store.commit("session/setReconnecting", false);
    clearTimeout(this._reconnectTimer);
    if (this._socket) {
      if (this._isSpectator) {
        this._sendDirect("host", "bye", this._store.state.session.playerId);
      }
      this._socket.close(1000);
      this._socket = null;
    }
  }

  /**
   * Alert any messages from the server
   */
  _alertPopup(text){
    alert(text);
  }

  /**
   * Send request to server to check if there are more than one host.
   */
  requestDuplicateHost() {
    if (!this._store.state.session.firstHostCheck) return;
    this._request("checkDuplicateHost", this._store.state.session.playerId);
  }
  
  /**
   * @param duplicate indicator to if there is a duplicated host
   */
  _handleDuplicateHost(duplicate) {
    if (!this._store.state.session.firstHostCheck) return;
    if (duplicate) {
      alert(`房间"${this._store.state.session.sessionId}"已经存在说书人！`)
      this._store.commit("session/setSessionId", "");
      this._store.commit("players/clear");
    } else {
      this._store.commit("session/setFirstHostCheck", false);
    }
  }

  /**
   * Send request to server to check if the channel exists (has a host).
   */
  requestExistChannel() {
    if (!this._store.state.session.firstJoinCheck) return;
    this._request("checkExistChannel", this._store.state.session.playerId);
  }

  /**
   * @param existing indicator to if there is the appointed session has a host.
   */
  _handleExistChannel(existing) {
    if (!this._store.state.session.firstJoinCheck) return;
    if (!existing) {
      alert(`房间"${this._store.state.session.sessionId}"不存在！`);
      this._store.commit("session/setSessionId", "");
      this._store.commit("session/setSpectator", false);
    } else {
      this._store.commit("session/setFirstJoinCheck", false);
    }
  }

  /**
   * Publish the current gamestate.
   * Optional param to reduce traffic. (send only player data)
   * @param playerId
   * @param isLightweight
   */
  sendGamestate(playerId = "", isLightweight = false) {
    if (this._isSpectator) return;
    this._gamestate = this._store.state.players.players.map(player => ({
      name: player.name,
      id: player.id,
      image: player.image,
      isDead: player.isDead,
      isVoteless: player.isVoteless,
      isSecretVoteless: player.isSecretVoteless,
      pronouns: player.pronouns,
      ...(player.role && player.role.team === "traveler"
        ? { roleId: player.role.id }
        : {})
    }));
    if (isLightweight) {
      this._sendDirect(playerId, "gs", {
        gamestate: this._gamestate,
        isLightweight
      });
    } else {
      const { session, grimoire } = this._store.state;
      const { fabled } = this._store.state.players;
      this.sendEdition(playerId);
      this._sendDirect(playerId, "gs", {
        gamestate: this._gamestate,
        isNight: grimoire.isNight,
        isVoteHistoryAllowed: session.isVoteHistoryAllowed,
        isSecretVote: session.isSecretVote,
        isUseOldOrder: session.isUseOldOrder,
        nomination: session.nomination,
        votingSpeed: session.votingSpeed,
        lockedVote: session.lockedVote,
        isVoteInProgress: session.isVoteInProgress,
        markedPlayer: session.markedPlayer,
        fabled,
        ...(session.nomination ? { votes: session.votes } : {})
      });
    }
  }

  /**
   * Update the gamestate based on incoming data.
   * @param data
   * @private
   */
  _updateGamestate(data) {
    if (!this._isSpectator) return;
    const {
      gamestate,
      isLightweight,
      isNight,
      isVoteHistoryAllowed,
      isSecretVote,
      isUseOldOrder,
      nomination,
      votingSpeed,
      votes,
      lockedVote,
      isVoteInProgress,
      markedPlayer,
      fabled
    } = data;
    const players = this._store.state.players.players;
    // adjust number of players
    if (players.length < gamestate.length) {
      for (let x = players.length; x < gamestate.length; x++) {
        this._store.commit("players/add", gamestate[x].name);
      }
    } else if (players.length > gamestate.length) {
      for (let x = players.length; x > gamestate.length; x--) {
        this._store.commit("players/remove", x - 1);
      }
    }
    // update status for each player
    gamestate.forEach((state, x) => {
      const player = players[x];
      const { roleId } = state;
      // update relevant properties
      ["name", "id", "image", "isDead", "isSecretVoteless", "isVoteless", "pronouns"].forEach(property => {
        const value = state[property];
        if (player[property] !== value) {
          if (property === "isVoteless") {
            if (value || !player.isSecretVoteless) this._store.commit("players/update", { player, property, value });
          } else {
            this._store.commit("players/update", { player, property, value });
          }
        }
      });
      // roles are special, because of travelers
      if (roleId && player.role.id !== roleId) {
        const role =
          this._store.state.roles.get(roleId) ||
          this._store.getters.rolesJSONbyId.get(roleId);
        if (role) {
          this._store.commit("players/update", {
            player,
            property: "role",
            value: role
          });
        }
      } else if (!roleId && player.role.team === "traveler") {
        this._store.commit("players/update", {
          player,
          property: "role",
          value: {}
        });
      }
    });
    if (!isLightweight) {
      this._store.commit("toggleNight", !!isNight);
      this._store.commit("session/setVoteHistoryAllowed", isVoteHistoryAllowed);
      this._store.commit("session/setSecretVote", isSecretVote);
      this._store.commit("session/setUseOldOrder", isUseOldOrder);
      const nominatedPlayer = nomination.length ? players[nomination[1]] : null;
      this._store.commit("session/nomination", {
        nomination,
        votes,
        votingSpeed,
        lockedVote,
        isVoteInProgress,
        nominatedPlayer
      });
      this._store.commit("session/setMarkedPlayer", {val: markedPlayer, force: false});
      this._store.commit("players/setFabled", {fabled});
    }
  }

  sendStId(playerId = "") {
    if (this._isSpectator) return;
    this._sendDirect(playerId, "stId", this._store.state.session.playerId)
  }

  _updateStId(data) {
    if (!this._isSpectator) return;
    // this._store.state.session.stId = data;
    this._store.commit("session/setStId", data);
  }

  /**
   * Publish an edition update. ST only
   * @param playerId
   */
  sendEdition(playerId = "") {
    if (this._isSpectator) return;
    const { edition } = this._store.state;
    let roles;
    if (!edition.isOfficial) {
      roles = this._store.getters.customRolesStripped;
    }
    this._sendDirect(playerId, "edition", {
      edition: edition.isOfficial ? { id: edition.id } : edition,
      ...(roles ? { roles } : {})
    });
  }

  /**
   * Update edition and roles for custom editions.
   * @param edition
   * @param roles
   * @private
   */
  _updateEdition({ edition, roles }) {
    if (!this._isSpectator) return;
    this._store.commit("setEdition", edition);
    if (roles) {
      this._store.commit("setCustomRoles", roles);
      if (this._store.state.roles.size !== roles.length) {
        const missing = [];
        roles.forEach(({ id }) => {
          if (!this._store.state.roles.get(id)) {
            missing.push(id);
          }
        });
        alert(
          `This session contains custom characters that can't be found. ` +
            `Please load them before joining! ` +
            `Missing roles: ${missing.join(", ")}`
        );
        this.disconnect();
        this._store.commit("toggleModal", "edition");
      }
    }
  }

  /**
   * Publish a fabled update. ST only
   */
  sendFabled() {
    if (this._isSpectator) return;
    const { fabled } = this._store.state.players;
    this._send(
      "fabled",
      fabled
    );
  }

  /**
   * Update fabled roles.
   * @param fabled
   * @private
   */
  _updateFabled(fabled) {
    if (!this._isSpectator) return;
    this._store.commit("players/setFabled", {
      fabled
    });
  }

  /**
   * Publish a player update.
   * @param player
   * @param property
   * @param value
   */
  sendPlayer({ player, property, value }) {
    if (this._isSpectator || property === "reminders") return;
    const index = this._store.state.players.players.indexOf(player);
    if (property === "role") {
      if (value.team && value.team === "traveler") {
        // update local gamestate to remember this player as a traveler
        if (this._gamestate[index]) this._gamestate[index].roleId = value.id;
        this._send("player", {
          index,
          property,
          value: value.id
        });
      } else if (this._gamestate[index] && this._gamestate[index].roleId) {
        // player was previously a traveler
        delete this._gamestate[index].roleId;
        this._send("player", { index, property, value: "" });
      }
    } else {
      this._send("player", { index, property, value });
    }
  }

  /**
   * Update a player based on incoming data. Player only.
   * @param index
   * @param property
   * @param value
   * @private
   */
  _updatePlayer({ index, property, value }) {
    if (!this._isSpectator) return;
    const player = this._store.state.players.players[index];
    if (!player) return;
    // special case where a player stops being a traveler
    if (property === "role") {
      if (!value && player.role.team === "traveler") {
        // reset to an unknown role
        this._store.commit("players/update", {
          player,
          property: "role",
          value: {}
        });
      } else {
        // load role, first from session, the global, then fail gracefully
        const role =
          this._store.state.roles.get(value) ||
          this._store.getters.rolesJSONbyId.get(value) ||
          {};
        this._store.commit("players/update", {
          player,
          property: "role",
          value: role
        });
      }
    } else if (property === "isSecretVoteless") {
      // if (value === true) {
        this._store.commit("players/update", { player, property, value });
        // 如果是玩家则同时移除投票标记
        if (player.id === this._store.state.session.playerId && value) {
          this._store.commit("players/update", { player, property: 'isVoteless', value });
        }
      // }
    } else if (property === "isVoteless") {
      if (!player.isSecretVoteless || value) this._store.commit("players/update", { player, property, value });
    } else {
      // just update the player otherwise
      this._store.commit("players/update", { player, property, value });
    }
  }

  emptyPlayer({id}) {
    this._sendDirect(id, "leaveSeat")
  }

  _updateLeaveSeat() {
    this._store.state.session.claimedSeat = -1;
  }

  /**
   * Publish a player pronouns update
   * @param player
   * @param value
   * @param isFromSockets
   */
  sendPlayerPronouns({ player, value, isFromSockets }) {
    //send pronoun only for the seated player or storyteller
    //Do not re-send pronoun data for an update that was recieved from the sockets layer
    if (
      isFromSockets ||
      (this._isSpectator && this._store.state.session.playerId !== player.id)
    )
      return;
    const index = this._store.state.players.players.indexOf(player);
    this._send("pronouns", [index, value]);
  }

  /**
   * Update a pronouns based on incoming data.
   * @param index
   * @param value
   * @private
   */
  _updatePlayerPronouns([index, value]) {
    const player = this._store.state.players.players[index];

    this._store.commit("players/update", {
      player,
      property: "pronouns",
      value,
      isFromSockets: true
    });
  }

  /**
   * Upload avatar image to the server and create a link.
   * @param image
   */
  uploadAvatar(image) {
    this._uploadFile("uploadAvatar", this._store.state.session.playerId, image);
  }
  
  /**
   * Confirmation on receiving the uploaded image.
   * @param image
   */
  _avatarReceived(link) {
    const playerId = this._store.state.session.playerId;
    const linkId = link.split(".")[0];
    if (playerId != linkId) return;

    this._store.commit("session/updatePlayerAvatar", link);
    alert("上传成功！");
  }

  /**
   * Handle a ping message by another player / storyteller
   * @param playerIdOrCount
   * @param latency
   * @private
   */
  _handlePing([playerIdOrCount = 0, latency] = []) {
    const now = new Date().getTime();
    // if (!this._players.length) return;
    if (!this._isSpectator) {
      // // remove players that haven't sent a ping in twice the timespan
      // for (let player in this._players) {
      //   if (now - this._players[player] > this._pingInterval * 2) {
      //     delete this._players[player];
      //     delete this._pings[player];
      //   }
      // }
      // // remove claimed seats from players that are no longer connected
      // this._store.state.players.players.forEach(player => {
      //   if (player.id && !this._players[player.id]) {
      //     if (!Object.keys(this._players).length) return; // backup plan for ST refreshes, always leaves one player un-quitted
      //     this._store.commit("players/update", {
      //       player,
      //       property: "id",
      //       value: ""
      //     });
      //     this._store.commit("players/update", {
      //       player,
      //       property: "name",
      //       value: ""
      //     });
      //     this._store.commit("players/update", {
      //       player,
      //       property: "image",
      //       value: ""
      //     });
      //   }
      // });
      // store new player data
      if (playerIdOrCount) {
        this._players[playerIdOrCount] = now;
        const ping = parseInt(latency, 10);
        if (ping && ping > 0 && ping < 30 * 1000) {
          // ping to Players
          this._pings[playerIdOrCount] = ping;
          const pings = Object.values(this._pings);
          this._store.commit(
            "session/setPing",
            Math.round(pings.reduce((a, b) => a + b, 0) / pings.length)
          );
        }
      }
    } else if (latency) {
      // ping to ST
      this._store.commit("session/setPing", parseInt(latency, 10));
    }
    // update player count
    if (!this._isSpectator || playerIdOrCount) {
      this._store.commit(
        "session/setPlayerCount",
        this._isSpectator ? playerIdOrCount : Object.keys(this._players).length
      );
    }
  }

  _handlePong() {
    this._isAlive = true;
  }

  /**
   * Handle a player leaving the sessions. ST only
   * @param playerId
   * @private
   */
  _handleBye(playerId) {
    if (this._isSpectator) return;
    delete this._players[playerId];
    this._store.commit(
      "session/setPlayerCount",
      Object.keys(this._players).length
    );
  }

  /**
   * Claim a seat, needs to be confirmed by the Storyteller.
   * Seats already occupied can't be claimed.
   * @param seat either -1 to vacate or the index of the seat claimed
   */
  claimSeat(seat) {
    if (!this._isSpectator) return;
    const players = this._store.state.players.players;
    if (players.length > seat && (seat < 0 || !players[seat].id)) {
      // this._send("claim", [seat, this._store.state.session.playerId, this._store.state.session.playerName, this._store.state.session.playerAvatar]);
      this._sendDirect("host", "claim", [seat, this._store.state.session.playerId, this._store.state.session.playerName, this._store.state.session.playerAvatar]);
    }
  }

  /**
   * Update a player id associated with that seat.
   * @param index seat index or -1
   * @param value playerId to add / remove
   * @private
   */
  _updateSeat([index, value, name, image]) {
    // index is the seat number, value is the playerId, name is the playerName
    if (this._isSpectator) return;
    // const property = "id";
    const players = this._store.state.players.players;
    if (index >= 0 && players[index].id) return;
    // remove previous seat
    const oldIndex = players.findIndex(({ id }) => id === value);
    if (oldIndex >= 0 && oldIndex !== index) {
      this._store.commit("players/update", {
        player: players[oldIndex],
        property: "id",
        value: ""
      });
      // this._store.commit("players/update", {
      //   player: players[oldIndex],
      //   property: "name",
      //   value: ""
      // });
      // this._store.commit("players/update", {
      //   player: players[oldIndex],
      //   property: "image",
      //   value: ""
      // });
      if (players[oldIndex].isTalking === true) {
        this._store.commit("players/update", {
          player: players[oldIndex],
          property: "isTalking",
          value: false
        });
      }
    }
    // add playerId to new seat
    if (index >= 0) {
      const player = players[index];
      if (!player) return;
      this._store.commit("players/update", { player, property: "image", value: image });
      this._store.commit("players/update", { player, property:"name", value: name});
      this._store.commit("players/update", { player, property: "id", value });
    }
    // update player session list as if this was a ping
    this._handlePing([true, value, 0]);
  }


  /**
   * Create a chat history for a playerID.
   * @param index seat index (only created when seat claimed but not removed)
   * @param value playerId to add
   * @private
   */
  _createChatHistory([index]) {
    if (index < 0) return;
    const playerId = (this._store.state.players.players[index]).id;
    if (playerId === "") return;
    if (this._store.state.session.chatHistory[playerId] != undefined) return;
    if (this._isSpectator && this._store.state.session.playerId != playerId) return;
    this._store.commit("session/createChatHistory", playerId );
  }

  /**
   * Distribute player roles to all seated players in a direct message.
   * This will be split server side so that each player only receives their own (sub)message.
   */
  distributeRoles() {
    if (this._isSpectator) return;
    const message = {};
    this._store.state.players.players.forEach((player, index) => {
      if (player.id && player.role) {
        message[player.id] = [
          "player",
          { index, property: "role", value: player.role.id }
        ];
      }
    });
    if (Object.keys(message).length) {
      this._send("direct", message);
    }
  }

  /**
   * Distribute bluffs to demon, lunatic, minion players.
   * This will be split server side so that each player only receives their own (sub)message.
   * @param param is the role/team to be sent to
   */
  distributeBluffs({param}) {
    if (this._isSpectator) return;
    if (!param) return;

    var team = "";
    switch (param) {
      case "demon":
      case "lunatic":
      case "demonAll":
        team = "demon";
        break;
      case "snitch":
      case "widow":
      case "spy":
        team = "minion";
    }

    const message = {};
    this._store.state.players.players.forEach(player => {
      if (player.id && player.role && player.role.team == team) {
        if (team === "demon"){
          let lunatic = false;
          player.reminders.forEach(reminder => {
            if (reminder.role === "lunatic") {
              lunatic = true;
              return;
            }
          })
          if ((param === "lunatic" && !lunatic) || (param === "demon" && lunatic)) return;
        }else if ((param === "widow" || param === "spy") && player.role.id != param) return; 
        message[player.id] = [
          "bluff",
          this._store.state.players.bluffs
        ];
      }
    });
    if (Object.keys(message).length) {
      this._send("direct", message);
    }
  }

  /**
   * Update demon bluffs based on incoming data. Demon/Luantic only.
   * @param bluffs
   */
  _updateBluff(bluffs) {
    if (!this._isSpectator) return;
    this._store.commit("players/updateBluff", bluffs);
  }

  /**
   * Distribute to widow and spy in a direct message.
   * This will be split server side so that each player only receives their own (sub)message.
   * @param param is the role/team to be sent to
   */
  distributeGrimoire({param}) {
    if (this._isSpectator) return;
    if (!param) return;
    if (param != "widow" && param != "spy") return;

    // send all roles and reminders
    const message = {};
    this._store.state.players.players.forEach((player) => {
      if (player.id && player.role && player.role.id == param) {
        message[player.id] = ["grimoire", {roles: [], reminders: []}];
        this._store.state.players.players.forEach((player2, index) => {
          message[player.id][1].roles.push([
            { index, property: "role", value: player2.role.id }
          ]);
          message[player.id][1].reminders.push([
            { index, property: "reminder", value: player2.reminders }
          ]);
        })
      }
    });
    if (Object.keys(message).length) {
      this._send("direct", message);
    }

    // send bluffs
    this.distributeBluffs({param});
  }

  /**
   * Update grimoire once received
   * @param payload is the grimoire details.
   */
  _updateGrimoire(payload){
    // set roles
    payload.roles.forEach(grimRole => {
      // load role, first from session, the global, then fail gracefully
      const role =
        this._store.state.roles.get(grimRole[0].value) ||
        this._store.getters.rolesJSONbyId.get(grimRole[0].value) ||
        {};
      if (role.team === "traveler") return;
      const player = this._store.state.players.players[grimRole[0].index];
      this._store.commit("players/update", {
        player,
        property: "role",
        value: role
      });
    })
    
    // set reminders
    payload.reminders.forEach(grimReminder => {
      if (!grimReminder[0].value.length) return
      const player = this._store.state.players.players[grimReminder[0].index];
      const value = Array.from(player.reminders);
      grimReminder[0].value.forEach(reminder => {
        if (reminder.role === "custom") return;
        value.push(reminder);
      });
      this._store.commit("players/update", {
        player,
        property: "reminders",
        value
      });
    })
  }

  /**
   * A player nomination. ST only
   * This also syncs the voting speed to the players.
   * Payload can be an object with {nomination} property or just the nomination itself, or undefined.
   * @param payload [nominator, nominee]|{nomination}
   */
  nomination(payload) {
    if (this._isSpectator) return;
    const nomination = payload ? payload.nomination || payload : payload;
    const players = this._store.state.players.players;
    if (
      !nomination ||
      (players.length > nomination[0] && players.length > nomination[1])
    ) {
      this.setVotingSpeed(this._store.state.session.votingSpeed);
      this._send("nomination", nomination);
    }
  }

  /**
   * Set the isVoteInProgress status. ST only
   */
  setVoteInProgress() {
    if (this._isSpectator) return;
    this._send("isVoteInProgress", this._store.state.session.isVoteInProgress);
  }

  /**
   * Send the isNight status. ST only
   */
  setIsNight() {
    if (this._isSpectator) return;
    this._send("isNight", this._store.state.grimoire.isNight);
  }

  /**
   * Send the isVoteHistoryAllowed state. ST only
   */
  setVoteHistoryAllowed() {
    if (this._isSpectator) return;
    this._send(
      "isVoteHistoryAllowed",
      this._store.state.session.isVoteHistoryAllowed
    );
  }

  /**
   * Send the voting speed. ST only
   * @param votingSpeed voting speed in seconds, minimum 1
   */
  setVotingSpeed(votingSpeed) {
    if (this._isSpectator) return;
    if (votingSpeed) {
      this._send("votingSpeed", votingSpeed);
    }
  }

  /**
   * Set which player is on the block. ST only
   * @param playerIndex, player id or -1 for empty
   */
  setMarked(playerIndex) {
    if (this._isSpectator) return;
    if (this._store.state.session.isSecretVote) return;
    this._send("marked", playerIndex);
  }

  /**
   * Clear the vote history for everyone. ST only
   */
  clearVoteHistory() {
    if (this._isSpectator) return;
    this._send("clearVoteHistory");
  }

  /**
   * Send a vote. Player or ST
   * @param index Seat of the player
   * @param sync Flag whether to sync this vote with others or not
   */
  vote([index]) {
    const player = this._store.state.players.players[index];
    if (
      this._store.state.session.playerId === player.id ||
      !this._isSpectator
    ) {
      if (
        this._store.state.players.players[this._store.state.session.nomination[1]].role.team === "traveler" ||
        !this._store.state.session.isSecretVote
      ) { // send to everyone if exile or secret vote is off
        // send vote only if it is your own vote or you are the storyteller
        this._send("vote", [
          index,
          this._store.state.session.votes[index],
          !this._isSpectator
        ]);
      } else { // otherwise only send direct messages
        if (this._isSpectator) {
          this._sendDirect("host", "vote", [
            index,
            this._store.state.session.votes[index],
            !this._isSpectator
          ])
        } else {
          this._sendDirect(player.id, "vote", [
            index,
            this._store.state.session.votes[index],
            !this._isSpectator
          ])
        }
      }
    }
  }

  /**
   * Send a status change to whether anonymous votes are in progress. ST to players only
   */
  setSecretVote(isSecretVote){
    if (this._isSpectator) return;
    this._send("secretVote", isSecretVote);
  }

  _handleSecretVote(isSecretVote){
    if (!this._isSpectator) return;
    this._store.state.session.isSecretVote = isSecretVote;
  }

  setBootlegger(content){
    if (this._isSpectator) return;
    this._send("bootlegger", content);
  }

  _handleSetBootlegger(content){
    if (!this._isSpectator) return;
    this._store.state.session.bootlegger = content;
  }

  setUseOldOrder(isUseOldOrder){
    if (this._isSpectator) return;
    this._send("useOldOrder", isUseOldOrder);
  }

  _handleSetUseOldOrder(isUseOldOrder){
    if (!this._isSpectator) return;
    this._store.state.session.isUseOldOrder = isUseOldOrder;
  }

  /**
   * Set talking status to true to enable glowing animation
   * Send this update to all clients in the channel
   */
  setTalking(payload){
    if (payload.seatNum < 0 || payload.seatNum >= this._store.state.players.players.length) return;
    if (!this._store.state.players.players[payload.seatNum].id || this._store.state.players.players[payload.seatNum].id != this._store.state.session.playerId) return;
    this._send("setTalking", payload);
  }

  /**
   * Set talking status to true to enable glowing animation when received
   */
  _handleSetTalking(payload){
    if (payload.seatNum < 0 || payload.seatNum >= this._store.state.players.players.length) return;
    this._store.state.players.players[payload.seatNum].isTalking = payload.isTalking;
  }

  /**
   * Handle an incoming vote, but only if it is from ST or unlocked.
   * @param index
   * @param vote
   * @param fromST
   */
  _handleVote([index, vote, fromST]) {
    // do not reveal vote when anonymous voting is in progress, unless it's ST changing that player's vote
    const voteId = this._store.state.players.players[index].id;
    if (
      this._isSpectator && voteId != this._store.state.session.playerId && 
      this._store.state.session.isSecretVote && this._store.state.players.players[this._store.state.session.nomination[1]].role.team != "traveler"
    ) return;
    
    const { session, players } = this._store.state;
    const playerCount = players.players.length;
    const indexAdjusted =
      (index - 1 + playerCount - session.nomination[1]) % playerCount;
    if (fromST || indexAdjusted >= session.lockedVote - 1) {
      this._store.commit("session/vote", [index, vote]);
    }
  }

  /**
   * Lock a vote. ST only
   */
  lockVote() {
    if (this._isSpectator) return;
    const { lockedVote, votes, nomination } = this._store.state.session;
    const { players } = this._store.state.players;
    const index = (nomination[1] + lockedVote - 1) % players.length;
    this._send("lock", [this._store.state.session.lockedVote, votes[index]]);
  }

  /**
   * Update vote lock and the locked vote, if it differs. Player only
   * @param lock
   * @param vote
   * @private
   */
  _handleLock([lock, vote]) {
    if (!this._isSpectator) return;
    this._store.commit("session/lockVote", lock);
    
    if (lock > 1) {
      const { lockedVote, nomination } = this._store.state.session;
      const { players } = this._store.state.players;
      const index = (nomination[1] + lockedVote - 1) % players.length;
      // record as not voted when anonymous voting is in progress
      const displayVote = this._store.state.session.isSecretVote ? false : vote;
      if (this._store.state.session.votes[index] !== vote) {
        this._store.commit("session/vote", [index, displayVote]);
      }
    }
  }

  /**
   * Swap two player seats. ST only
   * @param payload
   */
  swapPlayer(payload) {
    if (this._isSpectator) return;
    this._send("swap", payload);
  }

  /**
   * Move a player to another seat. ST only
   * @param payload
   */
  movePlayer(payload) {
    if (this._isSpectator) return;
    this._send("move", payload);
  }

  /**
   * Remove a player. ST only
   * @param payload
   */
  removePlayer(payload) {
    if (this._isSpectator) return;
    this._send("remove", payload);
  }

  /**
   * Update chat history when received.
   * @param payload
   */
  _handleChat({message, sendingPlayerId, receivingPlayerId}, feedback){
    if (feedback) {
      this._request("deleteMessage", this._store.state.session.playerId, ["direct", feedback]);
      if (this._store.state.session.messageUniqueQueue[feedback]) return;
      this._store.commit("session/checkUniqueMessage", feedback);
    }
    if (this._isSpectator && receivingPlayerId != this._store.state.session.playerId) return;
    this._store.commit("session/updateChatReceived", {message, playerId: sendingPlayerId});
    const num = 1;
    if (!this._isSpectator){
      this._store.commit("players/setPlayerMessage", {playerId: sendingPlayerId, num});
    } else{
      this._store.commit("session/setStMessage", num);
    }
  }

  /**
   * Send out timer.
   * @param payload
   */
  setTimer(payload) {
    if (this._isSpectator) return;
    this._send("setTimer", payload);
  }

  /**
   * Update timer when received.
   * @param payload
   */
  _handleSetTimer(time){
    this._store.commit("session/setTimer", time);
  }

  /**
   * Send out starting timer.
   * @param payload
   */
  startTimer(payload) {
    if (this._isSpectator) return;
    this._send("startTimer", payload);
  }

  /**
   * Starting timer.
   */
  _handleStartTimer(payload){
    this._store.commit("session/startTimer", payload);
  }

  /**
   * Send out starting timer.
   * @param payload
   */
  stopTimer(payload) {
    if (this._isSpectator) return;
    this._send("stopTimer", payload);
  }

  /**
   * Starting timer.
   */
  _handleStopTimer(){
    this._store.commit("session/stopTimer");
  }
}

export default store => {
  // setup
  const session = new LiveSession(store);

  // listen to mutations
  store.subscribe(({ type, payload }, state) => {
    switch (type) {
      case"requestDuplicateHost":
        if (!state.session.sessionId) {
          session.requestDuplicateHost()
        }
        break;
      case "session/setSessionId":
        if (state.session.sessionId) {
          session.connect(state.session.sessionId);
        } else {
          window.location.hash = "";
          session.disconnect();
        }
        break;
      case "session/claimSeat":
        session.claimSeat(payload);
        break;
      case "session/distributeRoles":
        if (payload) {
          session.distributeRoles();
        }
        break;
      case "session/distributeBluffs":
        if (payload) {
          session.distributeBluffs(payload);
        }
        break;
      case "session/distributeGrimoire":
        if (payload) {
          session.distributeGrimoire(payload);
        }
        break;
      case "session/nomination":
      case "session/setNomination":
        session.nomination(payload);
        break;
      case "session/setVoteInProgress":
        session.setVoteInProgress(payload);
        break;
      case "session/voteSync":
        session.vote(payload);
        break;
      case "session/lockVote":
        session.lockVote();
        break;
      case "session/setVotingSpeed":
        session.setVotingSpeed(payload);
        break;
      // case "session/clearVoteHistory":
      //   session.clearVoteHistory();
      //   break;
      case "session/setVoteHistoryAllowed":
        session.setVoteHistoryAllowed();
        break;
      case "toggleNight":
        session.setIsNight();
        break;
      case "setEdition":
        session.sendEdition();
        break;
      case "players/setFabled":
        session.sendFabled();
        break;
      case "session/setMarkedPlayer":
        session.setMarked(payload);
        break;
      case "players/swap":
        session.swapPlayer(payload);
        break;
      case "players/move":
        session.movePlayer(payload);
        break;
      case "players/remove":
        session.removePlayer(payload);
        break;
      case "players/set":
      case "players/clear":
      case "players/add":
        session.sendGamestate("", true);
        break;
      case "players/update":
        if (payload.property === "pronouns") {
          session.sendPlayerPronouns(payload);
        } else {
          session.sendPlayer(payload);
        }
        break;
      case "players/empty":
        session.emptyPlayer(payload);
        break;
      case "session/addMessageQueue":
        session._startSendQueue();
        break;
      case "session/deleteMessageQueue":
        if (session._store.state.session.messageQueue.length <= 0) session._stopSendQueue();
        break;
      case "session/setTimer":
        session.setTimer(payload);
        break;
      case "session/startTimer":
        session.startTimer(payload);
        break;
      case "session/stopTimer":
        session.stopTimer(payload);
        break;
      case "session/setPlayerAvatar":
        session.uploadAvatar(payload);
        break;
      case "session/setSecretVote":
        session.setSecretVote(payload);
        break;
      case "session/setUseOldOrder":
        session.setUseOldOrder(payload);
        break;
      // case "session/setBootlegger":
      //   session.setBootlegger(payload);
      //   break;
      case "session/setTalking":
        session.setTalking(payload);
        break;
    }
  });

  // check for session Id in hash
  const sessionId = window.location.hash.substr(1);
  if (sessionId) {
    store.commit("session/setSpectator", true);
    store.commit("toggleGrimoire", false);

    if (!session._store.state.session.playerName) {
      let name = prompt("输入玩家昵称");
      if (name) {
        name = name.trim();
        while (name === "空座位" || name === "说书人"){
          alert("昵称非法！");
          name = prompt("输入玩家昵称");
          if (name) {
            name = name.trim();
          };
        }
      };
      if (name) {
        store.commit("session/setPlayerName", name);
      }
    };
    if (session._store.state.session.playerName) {
      store.commit("session/setSessionId", sessionId);
    } else {
      store.commit("session/setSessionId", "");
    }
  }
};
