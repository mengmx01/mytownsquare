module.exports = store => {
  const updatePagetitle = isPublic =>
    // (document.title = `Blood on the Clocktower ${
    //   isPublic ? "Town Square" : "Grimoire"
    // }`);
    (document.title = `编程技术分享平台 ${
      isPublic ? "" : ""
    }`);

  // initialize data
  if (localStorage.getItem("background")) {
    store.commit("setBackground", localStorage.background);
  }
  if (localStorage.getItem("muted")) {
    store.commit("toggleMuted", true);
  }
  if (localStorage.getItem("static")) {
    store.commit("toggleStatic", true);
  }
  if (localStorage.getItem("imageOptIn")) {
    store.commit("toggleImageOptIn", true);
  }
  if (localStorage.getItem("zoom")) {
    store.commit("setZoom", parseFloat(localStorage.getItem("zoom")));
  }
  if (localStorage.getItem("isGrimoire")) {
    store.commit("toggleGrimoire", false);
    updatePagetitle(false);
  }
  if (localStorage.getItem("useOldOrder")) {
    store.commit("session/setUseOldOrder", JSON.parse(localStorage.getItem("useOldOrder")));
  }
  if (localStorage.getItem("selectedEditions")) {
    store.commit("setSelectedEditions", JSON.parse(localStorage.getItem("selectedEditions")));
  }
  if (localStorage.roles !== undefined) {
    store.commit("setCustomRoles", JSON.parse(localStorage.roles));
    store.commit("setEdition", { id: "custom" });
  }
  if (localStorage.getItem("states")) {
    store.commit("setStates", JSON.parse(localStorage.states));
  }
  if (localStorage.getItem("teamsNames")) {
    store.commit("setTeamsNames", JSON.parse(localStorage.teamsNames))
  }
  if (localStorage.edition !== undefined) {
    // this will initialize state.roles for official editions
    store.commit("setEdition", JSON.parse(localStorage.edition));
  }
  if (localStorage.bluffs !== undefined) {
    JSON.parse(localStorage.bluffs).forEach((role, index) => {
      store.commit("players/setBluff", {
        index,
        role: store.state.roles.get(role) || {}
      });
    });
  }
  if (localStorage.getItem("playerProfileImage")) {
    localStorage.setItem("playerAvatar", localStorage.getItem("playerProfileImage"));
    localStorage.removeItem("playerProfileImage");
  }
  if (localStorage.fabled !== undefined) {
    store.commit("players/setFabled", {
      // fabled: JSON.parse(localStorage.fabled).map(
      //   fabled => store.state.fabled.get(fabled.id) || fabled
      // )
      fabled: JSON.parse(localStorage.fabled),
      emptyFabled: true
    });
  }
  if (localStorage.players) {
    store.commit(
      "players/set",
      JSON.parse(localStorage.players).map(player => ({
        ...player,
        role:
          store.state.roles.get(player.role) ||
          store.getters.rolesJSONbyId.get(player.role) ||
          {}
      }))
    );
  }
  /**** Session related data *****/
  if (localStorage.getItem("isJoinAllowed")) {
    store.commit("session/setIsJoinAllowed", JSON.parse(localStorage.getItem("isJoinAllowed")));
  }
  if (localStorage.getItem("isHostAllowed")) {
    store.commit("session/setIsHostAllowed", JSON.parse(localStorage.getItem("isHostAllowed")));
  }
  if (localStorage.getItem("playerId")) {
    store.commit("session/setPlayerId", localStorage.getItem("playerId"));
  }
  if (localStorage.getItem("playerName")) {
    store.commit("session/setPlayerName", localStorage.getItem("playerName"));
  }
  if (localStorage.getItem("stId")) {
    store.commit("session/setStId", localStorage.getItem("stId"));
  }
  if (localStorage.getItem("claimedSeat")) {
    store.commit("session/claimSeat", Number(localStorage.getItem("claimedSeat")));
  }
  if (localStorage.getItem("session") && !window.location.hash.substr(1)) {
    const [spectator, sessionId] = JSON.parse(localStorage.getItem("session"));
    store.commit("session/setSpectator", spectator);
    store.commit("session/setSessionId", sessionId);
  }
  if (localStorage.getItem("votes")) {
    const votes = JSON.parse(localStorage.getItem("votes"));
    votes.forEach(voteHistory => {
      store.commit("session/addVotes", voteHistory);
    })
  }
  if (localStorage.getItem("votesSelected")) {
    const votesSelected = JSON.parse(localStorage.getItem("votesSelected"));
    votesSelected.forEach(voteSelected => {
      store.commit("session/addVoteSelected", voteSelected);
    })
  }
  if (localStorage.getItem("customBootlegger")) {
    const customBootlegger = JSON.parse(localStorage.getItem("customBootlegger"));
    store.commit("session/setBootlegger", customBootlegger);
  }
  if (localStorage.getItem("chatHistory")) {
    const chatHistory = JSON.parse(localStorage.getItem("chatHistory"));
    chatHistory.forEach(player => {
      store.commit("session/createChatHistory", player.id);
      player.chat.forEach(message => {
        store.commit("session/updateChatReceived", {message, playerId: player.id});
      })
    })
  }
  if (localStorage.getItem("playerAvatar")) {
    store.commit("session/updatePlayerAvatar", localStorage.getItem("playerAvatar"));
  }
  if (localStorage.getItem("secretVote")) {
    store.commit("session/setSecretVote", JSON.parse(localStorage.getItem("secretVote")));
  }
  // listen to mutations
  store.subscribe(({ type, payload }, state) => {
    switch (type) {
      case "toggleGrimoire":
        if (!state.grimoire.isPublic) {
          localStorage.setItem("isGrimoire", 1);
        } else {
          localStorage.removeItem("isGrimoire");
        }
        updatePagetitle(state.grimoire.isPublic);
        break;
      case "setBackground":
        if (payload) {
          localStorage.setItem("background", payload);
        } else {
          localStorage.removeItem("background");
        }
        break;
      case "toggleMuted":
        if (state.grimoire.isMuted) {
          localStorage.setItem("muted", 1);
        } else {
          localStorage.removeItem("muted");
        }
        break;
      case "toggleStatic":
        if (state.grimoire.isStatic) {
          localStorage.setItem("static", 1);
        } else {
          localStorage.removeItem("static");
        }
        break;
      case "toggleImageOptIn":
        if (state.grimoire.isImageOptIn) {
          localStorage.setItem("imageOptIn", 1);
        } else {
          localStorage.removeItem("imageOptIn");
        }
        break;
      case "setZoom":
        if (payload !== 0) {
          localStorage.setItem("zoom", payload);
        } else {
          localStorage.removeItem("zoom");
        }
        break;
      case "setSelectedEditions":
        localStorage.setItem("selectedEditions", JSON.stringify(payload));
        break;
      case "setEdition":
        localStorage.setItem("edition", JSON.stringify(payload));
        if (state.edition.isOfficial) {
          localStorage.removeItem("roles");
        }
        break;
      case "setCustomRoles":
        if (!payload.length) {
          localStorage.removeItem("roles");
        } else {
          localStorage.setItem("roles", JSON.stringify(payload));
        }
        break;
      case "setStates":
        localStorage.setItem("states", JSON.stringify(payload));
        break;
      case "setTeamsNames":
        localStorage.setItem("teamsNames", JSON.stringify(payload));
        break;
      case "players/setBluff":
      case "players/updateBluff":
        localStorage.setItem(
          "bluffs",
          JSON.stringify(state.players.bluffs.map(({ id }) => id))
        );
        break;
      case "players/setFabled":
        localStorage.setItem(
          "fabled",
          JSON.stringify(state.players.fabled)
        );
        break;
      case "players/add":
      case "players/update":
      case "players/remove":
      case "players/clear":
      case "players/set":
      case "players/swap":
      case "players/move":
        if (state.players.players.length) {
          localStorage.setItem(
            "players",
            JSON.stringify(
              state.players.players.map(player => ({
                ...player,
                // simplify the stored data
                role: player.role.id || {}
              }))
            )
          );
        } else {
          localStorage.removeItem("players");
        }
        break;
      case "session/setSessionId":
        if (payload) {
          localStorage.setItem(
            "session",
            JSON.stringify([state.session.isSpectator, payload])
          );
        } else {
          localStorage.removeItem("session");
        }
        break;
      case "session/setIsHostAllowed":
        if (payload === null) {
          localStorage.removeItem("isHostAllowed");
        } else {
          localStorage.setItem("isHostAllowed", JSON.stringify(payload));
        }
        break;
      case "session/setIsJoinAllowed":
        if (payload === null) {
          localStorage.removeItem("isHostAllowed");
        } else {
          localStorage.setItem("isHostAllowed", JSON.stringify(payload));
        }
        break;
      case "session/setPlayerId":
        if (payload) {
          localStorage.setItem("playerId", payload);
        } else {
          localStorage.removeItem("playerId");
        }
        break;
      case "session/setPlayerName":
        if (payload) {
          localStorage.setItem("playerName", payload);
        } else {
          localStorage.removeItem("playerName");
        }
        break;
      case "session/setStId":
        localStorage.setItem("stId", payload);
        break;
      case "session/claimSeat":
        if (payload >= 0) {
          localStorage.setItem("claimedSeat", payload);
        } else {
          localStorage.removeItem("claimedSeat");
        }
        break;
      case "session/addVotes": {
        if (payload.save) {
          const votes = localStorage.getItem("votes") ? JSON.parse(localStorage.getItem("votes")) : [];
          payload.save = false;
          votes.push(payload);
          localStorage.setItem("votes", JSON.stringify(votes));
        }
        break;
      }
      case "session/addVoteSelected": {
        if (payload.save) {
          const votesSelected = localStorage.getItem("votesSelected") ? JSON.parse(localStorage.getItem("votesSelected")) : [];
          payload.save = false;
          votesSelected.push(payload);
          localStorage.setItem("votesSelected", JSON.stringify(votesSelected));
        }
        break;
      }
      case "session/clearVoteHistory": {
        if (!localStorage.getItem("votes")) break;
        if (!localStorage.getItem("votesSelected")) break;
        if (!payload || payload.length === 0) {
          localStorage.removeItem("votes");
          localStorage.removeItem("votesSelected");
        } else {
          const votes = JSON.parse(localStorage.getItem("votes"));
          const votesSelected = JSON.parse(localStorage.getItem("votesSelected"))
          const newVotes = votes.filter((_, index) => !payload.includes(index));
          const newVotesSelected = votesSelected.filter((_, index) => !payload.includes(index));
          localStorage.setItem("votes", JSON.stringify(newVotes));
          localStorage.setItem("votesSelected", JSON.stringify(newVotesSelected));
        }
        break;
      }
      case "session/setBootlegger":
        localStorage.setItem("customBootlegger", JSON.stringify(payload));
        break;
      case "session/createChatHistory":
      case "session/updateChatSent":
      case "session/updateChatReceived":
        if (state.session.chatHistory) {
          localStorage.setItem("chatHistory", JSON.stringify(state.session.chatHistory));
        } else {
          localStorage.removeItem("chatHistory");
        }
        break;
      case "session/updatePlayerAvatar":
        localStorage.setItem("playerAvatar", payload);
        break;
      case "session/setSecretVote":
        localStorage.setItem("secretVote", JSON.stringify(payload));
        break;
      case "session/setUseOldOrder":
        localStorage.setItem("useOldOrder", JSON.stringify(payload));
        break;
    }
  });
  // console.log(localStorage);
  // localStorage.clear();
};
