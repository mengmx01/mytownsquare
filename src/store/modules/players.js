const NEWPLAYER = {
  name: "",
  id: "",
  role: {},
  reminders: [],
  isVoteless: false,
  isDead: false,
  pronouns: "",
  newMessages: 0
};

// const deus_ex_fiasco = {"id":"deus_ex_fiasco","name":"失败的上帝","ability":"整局游戏限一次，说书人会犯一个错误，说书人可以纠正错误并公开承认它。","firstNight":0,"firstNightReminder":"","otherNight":0,"otherNightReminder":"","reminders":[],"remindersGlobal":[],"setup":0,"team":"fabled","isOfficial":true,"flavor":"","imageAlt":"fabled"};

const state = () => ({
  players: [],
  fabled: [],
  bluffs: []
});

const getters = {
  alive({ players }) {
    return players.filter(player => !player.isDead).length;
  },
  nonTravelers({ players }) {
    const nonTravelers = players.filter(
      player => player.role.team !== "traveler"
    );
    return Math.min(nonTravelers.length, 15);
  },
  // calculate a Map of player => night order
  nightOrder({ players, fabled }) {
    const firstNight = [0];
    const otherNight = [0];
    players.forEach(({ role }) => {
      if (role.firstNight && !firstNight.includes(role.firstNight)) {
        firstNight.push(role.firstNight);
      }
      if (role.otherNight && !otherNight.includes(role.otherNight)) {
        otherNight.push(role.otherNight);
      }
    });
    fabled.forEach(role => {
      if (role.firstNight && !firstNight.includes(role.firstNight)) {
        firstNight.push(role.firstNight);
      }
      if (role.otherNight && !otherNight.includes(role.otherNight)) {
        otherNight.push(role.otherNight);
      }
    });
    firstNight.sort((a, b) => a - b);
    otherNight.sort((a, b) => a - b);
    const nightOrder = new Map();
    players.forEach(player => {
      const first = Math.max(firstNight.indexOf(player.role.firstNight), 0);
      const other = Math.max(otherNight.indexOf(player.role.otherNight), 0);
      nightOrder.set(player, { first, other });
    });
    fabled.forEach(role => {
      const first = Math.max(firstNight.indexOf(role.firstNight), 0);
      const other = Math.max(otherNight.indexOf(role.otherNight), 0);
      nightOrder.set(role, { first, other });
    });
    return nightOrder;
  }
};

const actions = {
  randomize({ state, commit }) {
    const players = state.players
      .map(a => [Math.random(), a])
      .sort((a, b) => a[0] - b[0])
      .map(a => a[1]);
    players.forEach(player => {
      player["id"] = (players.indexOf(player) + 1).toString();
      player["name"] = player["id"].concat(". ", player["name"].split(". ")[1]);
    })
    commit("set", players);
  },
  clearRoles({ state, commit, rootState }) {
    let players;
    if (rootState.session.isSpectator) {
      players = state.players.map(player => {
        if (player.role.team !== "traveler") {
          player.role = {};
        }
        player.reminders = [];
        return player;
      });
    } else {
      players = state.players.map(({ name, id, pronouns }) => ({
        ...NEWPLAYER,
        name,
        id,
        pronouns
      }));
      commit("setFabled", { fabled: [] });
    }
    commit("set", players);
    commit("setBluff");
  }
};

const mutations = {
  clear(state) {
    state.players = [];
    state.bluffs = [];
    state.fabled = [];
  },
  set(state, players = []) {
    state.players = players;
  },
  /**
  The update mutation also has a property for isFromSockets
  this property can be addded to payload object for any mutations
  then can be used to prevent infinite loops when a property is
  able to be set from multiple different session on websockets.
  An example of this is in the sendPlayerPronouns and _updatePlayerPronouns
  in socket.js.
   */
  update(state, { player, property, value }) {
    const index = state.players.indexOf(player);
    if (index >= 0) {
      state.players[index][property] = value;
    }
  },
  add(state, name) {
    state.players.push({
      ...NEWPLAYER,
      name
    });
  },
  remove(state, index) {
    state.players.splice(index, 1);
    state.players.forEach(player => {
      player["id"] = (state.players.indexOf(player) + 1).toString();
      player["name"] = player["id"].concat(". ", player["name"].split(". ")[1]);
    })
  },
  swap(state, [from, to]) {

    [state.players[from], state.players[to]] = [
      state.players[to],
      state.players[from]
    ];
    // hack: "modify" the array so that Vue notices something changed
    state.players.splice(0, 0);
    state.players.forEach(player => {
      var seatNumber = (state.players.indexOf(player) + 1).toString();
      player["name"] = seatNumber.toString().concat(". ", player["name"].split(". ")[1]);
    })
  },
  move(state, [from, to]) {
    state.players.splice(to, 0, state.players.splice(from, 1)[0]);
    state.players.forEach(player => {
      var seatNumber= (state.players.indexOf(player) + 1).toString();
      player["name"] = seatNumber.concat(". ", player["name"].split(". ")[1]);
    })
  },
  setBluff(state, { index, role } = {}) {
    if (index !== undefined) {
      state.bluffs.splice(index, 1, role);
    } else {
      state.bluffs = [];
    }
  },
  setFabled(state, { index, fabled } = {}) {
    if (index !== undefined) {
      // do not ever remove the first fabled i.e. storyteller
      if (index == 0) return;
      state.fabled.splice(index, 1);
    } else if (fabled) {
      const fabledStoryteller = {
        "id": "storyteller",
        "firstNightReminder": "",
        "otherNightReminder": "",
        "reminders": [],
        "setup": false,
        "name": "Story Teller",
        "team": "fabled",
        "ability": "Click story teller to send ST messages."
      };
      // add storyteller fabled to allow direct messages
      if (fabled == "storyteller") fabled = fabledStoryteller;
      if (!Array.isArray(fabled)) {
        state.fabled.push(fabled);
      } else {
        // add in Story Teller if there isn't already one
        if (fabled[0].id != "storyteller"){
          fabled.unshift(fabledStoryteller)
        }
        state.fabled = fabled;
      }
    }
  },
  setPlayerMessage(state, {playerId, num}) {
    const playersId = [];
    state.players.forEach(player => {
      playersId.push(player["id"]);
    });
    const playerIndex = playersId.indexOf(playerId);
    if (num > 0){
      state.players[playerIndex].newMessages += num;
    } else{
      state.players[playerIndex].newMessages = num;
    }
    
  }
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
};
