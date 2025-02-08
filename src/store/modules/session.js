/**
 * Handle a vote request.
 * If the vote is from a seat that is already locked, ignore it.
 * @param state session state
 * @param index seat of the player in the circle
 * @param vote true or false
 */

import Vue from "vue";

const handleVote = (state, [index, vote]) => {
  if (!state.nomination) return;
  state.votes = [...state.votes];
  state.votes[index] = vote === undefined ? !state.votes[index] : vote;
};

const state = () => ({
  sessionId: "",
  firstHostCheck: true,
  firstJoinCheck: true,
  isSpectator: false,
  isReconnecting: false,
  playerCount: 0,
  ping: 0,
  playerId: "",
  playerName:"",
  playerAvatar: "default.webp",
  claimedSeat: -1,
  nomination: false,
  votes: [],
  lockedVote: 0,
  votingSpeed: 500,
  isVoteInProgress: false,
  isSecretVote: false,
  voteHistory: [],
  voteSelected: [],
  markedPlayer: -1,
  isVoteHistoryAllowed: true,
  isRolesDistributed: false,
  isBluffsDistributed: false,
  isGrimoireDistributed: false,
  chatHistory: [],
  newStMessage: [0],
  bootlegger: "",
  timer: 480,
  interval: null,
  isTalking: false,
  listeningFrame: null
});

const getters = {};

const actions = {};

// mutations helper functions
const set = key => (state, val) => {
  state[key] = val;
};

const mutations = {
  setFirstHostCheck: set("firstHostCheck"),
  setFirstJoinCheck: set("firstJoinCheck"),
  setPlayerId: set("playerId"),
  setStId: set("stId"),
  setSpectator: set("isSpectator"),
  setReconnecting: set("isReconnecting"),
  setPlayerCount: set("playerCount"),
  setPing: set("ping"),
  setVotingSpeed: set("votingSpeed"),
  setVoteInProgress: set("isVoteInProgress"),
  setMarkedPlayer(state, {val, force}) {
    if (!force && state.isSecretVote && val >= 0) return;
    state.markedPlayer = val;
  },
  setNomination: set("nomination"),
  setVoteHistoryAllowed: set("isVoteHistoryAllowed"),
  setListeningFrame: set("listeningFrame"),
  setSecretVote: set("isSecretVote"),
  setBootlegger: set("bootlegger"),
  claimSeat: set("claimedSeat"),
  distributeRoles: set("isRolesDistributed"),
  distributeBluffs(state, {val}){
    state.isBluffsDistributed = val;
  },
  distributeGrimoire(state, {val}){
    state.isGrimoireDistributed = val;
  },
  setSessionId(state, sessionId) {
    state.sessionId = sessionId
      .toLocaleLowerCase()
      .replace(/[^0-9a-z]/g, "")
      .substr(0, 10);
  },
  setPlayerName(state, name){
    state.playerName = name;
  },
  nomination(
    state,
    { nomination, votes, votingSpeed, lockedVote, isVoteInProgress, nominatedPlayer = null } = {}
  ) {
    state.nomination = nomination || false;
    if (!!nomination && !!nominatedPlayer && state.isSecretVote && nominatedPlayer.role.team != 'traveler') {
      for(let i=0; i<votes.length; i++) {
        if (i != state.claimedSeat) {votes[i] = false}
      }
    }
    state.votes = votes || [];
    state.votingSpeed = votingSpeed || state.votingSpeed;
    state.lockedVote = lockedVote || 0;
    state.isVoteInProgress = isVoteInProgress || false;
  },
  /**
   * Create an entry in the vote history log. Requires current player array because it might change later in the game.
   * Only stores votes that were completed.
   * @param state
   * @param players
   */
  addHistory(state, players) {
    if (!state.isVoteHistoryAllowed && state.isSpectator) return;
    if (!state.nomination || state.lockedVote <= players.length) return;
    const isExile = players[state.nomination[1]].role.team === "traveler";
    const votedPlayers = Array.from(players).filter((player, index) => state.votes[index]);
    votedPlayers.forEach(player => {
      player.seat = players.indexOf(player) + 1;
    });
    this.commit("session/addVotes", {
      timestamp: new Date(),
      nominator: (state.nomination[0] + 1).toString() + ". " + (players[state.nomination[0]].id ? players[state.nomination[0]].name : ""),
      nominee: (state.nomination[1] + 1).toString() + ". " + (players[state.nomination[1]].id ? players[state.nomination[1]].name : ""),
      type: isExile ? "流放" : "处决",
      mode: state.isSecretVote ? "闭眼" : "睁眼",
      majority: Math.ceil(
        players.filter(player => !player.isDead || isExile).length / 2
      ),
      votes: votedPlayers
        .map(({ seat, name }) => (seat + ". " + name)),
      save: true
    })
  },
  addVotes(state, {timestamp, nominator, nominee, type, mode, majority, votes, save}) {
    // 重写时间
    const newTime = save ? timestamp : new Date(timestamp);
    state.voteHistory.push({
      timestamp: newTime,
      nominator,
      nominee,
      type,
      mode,
      majority,
      votes
    });
  },
  addVoteSelected(state, {selected}) {
    state.voteSelected.push(selected);
  },
  setVoteSelected(state, {index, value}) {
    Vue.set(state.voteSelected, index, value);
  },
  clearVoteHistory(state, voteIndex = null) {
    if (voteIndex == null || voteIndex.length === 0) {
      state.voteHistory = [];
      state.voteSelected = [];
      return;
    }
    else {
      state.voteHistory = state.voteHistory.filter((_, index) => !voteIndex.includes(index));
      state.voteSelected = state.voteSelected.filter((_, index) => !voteIndex.includes(index));
    }
  },
  /**
   * Store a vote with and without syncing it to the live session.
   * This is necessary in order to prevent infinite voting loops.
   * @param state
   * @param vote
   */
  vote: handleVote,
  voteSync: handleVote,
  lockVote(state, lock) {
    state.lockedVote = lock !== undefined ? lock : state.lockedVote + 1;
  },
  createChatHistory(state, playerId){
    if (playerId === "") return;
    if (chatIndex(state, playerId) >= 0) return; // do nothing if it already exists
    Vue.set(state.chatHistory, state.chatHistory.length, {id: playerId, chat: []});
  },
  updateChatSent(state, {message, sendingPlayerId, receivingPlayerId}){
    if (state.isSpectator && sendingPlayerId != state.playerId) return;
    receivingPlayerId = receivingPlayerId === "host" ? state.stId : receivingPlayerId;
    state.chatHistory[chatIndex(state, receivingPlayerId)]["chat"].push(message);
  },
  updateChatReceived(state, {message, playerId}){
    if (state.isSpectator && playerId != state.stId) return;
    const playerIndex = chatIndex(state, playerId);
    const oldMessages = state.chatHistory[playerIndex]["chat"];
    Vue.set(state.chatHistory, playerIndex, {id: playerId, chat: [...oldMessages, message]})
  },
  setStMessage(state, num) {
    if (num > 0){
      const newNum = state.newStMessage[0] += num;
      Vue.set(state.newStMessage, 0, newNum);
    } else{
      const newNum = state.newStMessage[0] = num;
      Vue.set(state.newStMessage, 0, newNum);
    }
  },
  setPlayerAvatar(state){
    state.playerAvatar = "";
  },
  updatePlayerAvatar(state, link){
    state.playerAvatar = link;
  },
  startTimer(state, time){
    if (time) state.timer = time;
    state.interval = setInterval(() => {
      if (state.timer > 0) {
        state.timer--;
      }
    }, 1000);
  },
  stopTimer(state){
    clearInterval(state.interval);
  },
  setTalking(state, {seatNum, isTalking}){
    if (seatNum < 0 || seatNum >= this.state.players.players.length ) return;
    if (!this.state.players.players[seatNum].id || this.state.players.players[seatNum].id != state.playerId) return;
    state.isTalking = isTalking;
    this.commit("players/setIsTalking", {seatNum, isTalking});
  }
};


function chatIndex(state, playerId) {
  for (let i = 0; i < state.chatHistory.length; i++) {
    if (state.chatHistory[i]["id"] === playerId) {
      return i;
    }
  }
  return -1;
}


export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
};
