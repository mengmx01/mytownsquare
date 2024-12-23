<template>
  <div
    id="townsquare"
    class="square"
    :class="{
      public: grimoire.isPublic,
      spectator: session.isSpectator,
      vote: session.nomination
    }"
  >
    <ul class="circle" :class="['size-' + players.length]" :style="orientation">
      <Player
        v-for="(player, index) in players"
        :key="index"
        :player="player"
        @trigger="handleTrigger(index, $event)"
        :class="{
          from: Math.max(swap, move, nominate) === index,
          swap: swap > -1,
          move: move > -1,
          nominate: nominate > -1
        }"
      ></Player>
    </ul>

    <div
      class="bluffs"
      v-if="players.length"
      ref="bluffs"
      :class="{ closed: !isBluffsOpen }"
    >
      <h3>
        <span v-if="session.isSpectator" style="font-size: 100%;">不在场身份</span>
        <span v-else style="font-size: 100%;">恶魔的伪装身份</span>
        <font-awesome-icon icon="times-circle" @click.stop="toggleBluffs" />
        <font-awesome-icon icon="plus-circle" @click.stop="toggleBluffs" />
      </h3>
      <ul>
        <li
          v-for="index in bluffSize"
          :key="index"
          @click="openRoleModal(index * -1)"
          :style="isBluffsOpen ? floatingZoom : ''"
        >
          <Token :role="bluffs[index - 1]"></Token>
        </li>
      </ul>
    </div>

    <div class="fabled" :class="{ closed: !isFabledOpen }" v-if="fabled.length">
      <h3>
        <span>传奇角色</span>
        <font-awesome-icon icon="times-circle" @click.stop="toggleFabled" />
        <font-awesome-icon icon="plus-circle" @click.stop="toggleFabled" />
      </h3>
      <ul>
        <li
          v-for="(role, index) in fabled"
          v-show="index === 0 || isFabledOpen"
          :key="index"
          @click="removeFabled(index)"
          :style="floatingZoom"
        >
        <div v-if="index === 0">
          <div class="newMessage" v-for="(item, position) in session.newStMessage" :key="position" v-show="item > 0">{{ item }}</div>
        </div>
          <div
            class="night-order first"
            v-if="nightOrder.get(role).first && grimoire.isNightOrder"
          >
            <em>{{ nightOrder.get(role).first }}.</em>
            <span v-if="role.firstNightReminder">{{
              role.firstNightReminder
            }}</span>
          </div>
          <div
            class="night-order other"
            v-if="nightOrder.get(role).other && grimoire.isNightOrder"
          >
            <em>{{ nightOrder.get(role).other }}.</em>
            <span v-if="role.otherNightReminder">{{
              role.otherNightReminder
            }}</span>
          </div>
          <Token :role="role"></Token>
        </li>
      </ul>
    </div>

    <ReminderModal :player-index="selectedPlayer"></ReminderModal>
    <RoleModal :player-index="selectedPlayer"></RoleModal>

    <div v-show="isChatOpen" :class="{chat: !isChatMin, chatMin: isChatMin}" :style="chatStyle">
      <div class="title" @click="maximiseChat()">
        <span ref="chatWith" style="cursor: text; user-select: text; pointer-events: auto;"></span> 
        <span class="newMessage" v-for="(item, position) in session.newStMessage" :key="position" v-show="session.isSpectator && item > 0">{{ item }}</span>
        <span :class="{close: !isChatMin, open: isChatMin}" @click="toggleChat()">
          <font-awesome-icon icon="times" :class="{ turnedIcon45: isChatMin}"/>
        </span>
      </div>
      <div ref="chatContent" class="content" @scroll="checkToBottom">
        <div v-for="(player, index) in session.chatHistory"  :key="index" v-show="(session.isSpectator && player.id === session.playerId) || (!session.isSpectator && player.id === chattingPlayer)">
          <ul v-for="(content, chatIndex) in player.chat" :key="chatIndex">{{ content }}</ul>
        </div>
      </div>
      <form class="chatbox" @submit.prevent="sendChat">
        <input type="text" id="message" autocomplete="off" class="edit" @focus="typing" @blur="session.chatting = false" v-model="message">
        <button type="submit" class="send">发送</button>
      <div class="toBottom" v-if="false">
          移至底部
          <font-awesome-icon icon="arrow"/>
      </div>
      </form>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import Player from "./Player";
import Token from "./Token";
import ReminderModal from "./modals/ReminderModal";
import RoleModal from "./modals/RoleModal";

export default {
  components: {
    Player,
    Token,
    RoleModal,
    ReminderModal
  },
  computed: {
    ...mapGetters({ nightOrder: "players/nightOrder" }),
    ...mapState(["grimoire", "roles", "session"]),
    ...mapState("players", ["players", "bluffs", "fabled"]),
    orientation: function(){
      const ratio = this.windowWidth / this.windowHeight;
      const unit = this.windowWidth > this.windowHeight ? "height: 100%;" : "height: " + ratio * 100 + "%;";
      return unit;
    },
    floatingZoom: function(){
      const ratio = this.windowWidth / this.windowHeight;
      const size = ratio > 1 ? 14 : 8;
      return "height: " + size + "vh; width: " + size + "vh;";
    },
    chatStyle: function(){
      if (this.isChatMin) return;
      const ratio = this.windowWidth / this.windowHeight;
      if (ratio < 1) return 'width: 300px; height: 400px;';
      return 'width: 25%; height: 40%;';
    }
  },
  data() {
    return {
      selectedPlayer: 0,
      bluffSize: 3,
      swap: -1,
      move: -1,
      nominate: -1,
      isBluffsOpen: true,
      isFabledOpen: true,
      isChatMin: false,
      isChatOpen: false,
      minimising: false,
      chattingPlayer: "",
      message: "",
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
  },
  mounted(){
    window.addEventListener("resize", this.handleResize);
  },
  beforeDestroy(){
    window.removeEventListener("resize", this.handleResize);
  },
  methods: {
    toggleBluffs() {
      this.isBluffsOpen = !this.isBluffsOpen;
    },
    toggleFabled() {
      this.isFabledOpen = !this.isFabledOpen;
    },
    removeFabled(index) {
      if (this.session.isSpectator) {
        if (index === 0) {
          if (this.session.claimedSeat >= 0) this.openChat(0); //open chat box if user is a player
        }
        
      }else{
        this.$store.commit("players/setFabled", { index });
      }
    },
    handleTrigger(playerIndex, [method, params]) {
      if (typeof this[method] === "function") {
        this[method](playerIndex, params);
      }
    },
    handleResize(){
      this.windowWidth = window.innerWidth;
      this.windowHeight = window.innerHeight;
    },
    claimSeat(playerIndex) {
      if (!this.session.isSpectator) return;
      if (this.session.playerId === this.players[playerIndex].id) {
        this.$store.commit("session/claimSeat", -1);
      } else {
        this.$store.commit("session/claimSeat", playerIndex);
        this.$store.commit("session/createChatHistory", this.session.playerId);
      }
    },
    openReminderModal(playerIndex) {
      this.selectedPlayer = playerIndex;
      this.$store.commit("toggleModal", "reminder");
    },
    openRoleModal(playerIndex) {
      const player = this.players[playerIndex];
      if (this.session.isSpectator && player && player.role.team === "traveler")
        return;
      this.selectedPlayer = playerIndex;
      this.$store.commit("toggleModal", "role");
    },
    removePlayer(playerIndex) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (
        confirm(
          //`确定要移除玩家 ${this.players[playerIndex].name}？`
          `确定要移除该座位吗？`
        )
      ) {
        const { nomination } = this.session;
        if (nomination) {
          if (nomination.includes(playerIndex)) {
            // abort vote if removed player is either nominator or nominee
            this.$store.commit("session/nomination");
          } else if (
            nomination[0] > playerIndex ||
            nomination[1] > playerIndex
          ) {
            // update nomination array if removed player has lower index
            this.$store.commit("session/setNomination", [
              nomination[0] > playerIndex ? nomination[0] - 1 : nomination[0],
              nomination[1] > playerIndex ? nomination[1] - 1 : nomination[1]
            ]);
          }
        }
        this.$store.commit("players/remove", playerIndex);
      }
    },
    swapPlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        this.swap = from;
      } else {
        if (this.session.nomination) {
          // update nomination if one of the involved players is swapped
          const swapTo = this.players.indexOf(to);
          const updatedNomination = this.session.nomination.map(nom => {
            if (nom === this.swap) return swapTo;
            if (nom === swapTo) return this.swap;
            return nom;
          });
          if (
            this.session.nomination[0] !== updatedNomination[0] ||
            this.session.nomination[1] !== updatedNomination[1]
          ) {
            this.$store.commit("session/setNomination", updatedNomination);
          }
        }
        this.$store.commit("players/swap", [
          this.swap,
          this.players.indexOf(to)
        ]);
        this.cancel();
      }
    },
    movePlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        this.move = from;
      } else {
        if (this.session.nomination) {
          // update nomination if it is affected by the move
          const moveTo = this.players.indexOf(to);
          const updatedNomination = this.session.nomination.map(nom => {
            if (nom === this.move) return moveTo;
            if (nom > this.move && nom <= moveTo) return nom - 1;
            if (nom < this.move && nom >= moveTo) return nom + 1;
            return nom;
          });
          if (
            this.session.nomination[0] !== updatedNomination[0] ||
            this.session.nomination[1] !== updatedNomination[1]
          ) {
            this.$store.commit("session/setNomination", updatedNomination);
          }
        }
        this.$store.commit("players/move", [
          this.move,
          this.players.indexOf(to)
        ]);
        this.cancel();
      }
    },
    nominatePlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        if (from !== this.nominate) {
          this.nominate = from;
        }
      } else {
        const nomination = [this.nominate, this.players.indexOf(to)];
        this.$store.commit("session/nomination", { nomination });
        this.cancel();
      }
    },
    cancel() {
      this.move = -1;
      this.swap = -1;
      this.nominate = -1;
    },
    setStoryTeller(playerIndex) {
      if (this.session.isSpectator) return;
      const player = this.players[playerIndex];
      if (player.id) {
        if (player.id != "host") return;
        this.$store.commit("players/update", {player, property: "id", value: ""});
        this.$store.commit("players/update", {player, property: "name", value: ""});
        this.$store.commit("players/update", {player, property: "isVoteless", value: false});
        this.$store.commit("players/update", {player, property: "isDead", value: false});
      }
      else {
        this.$store.commit("players/update", {player, property: "id", value: "host"});
        this.$store.commit("players/update", {player, property: "name", value: "说书人"});
        this.$store.commit("players/update", {player, property: "isVoteless", value: true});
        this.$store.commit("players/update", {player, property: "isDead", value: true});
      }
    },
    openChat(playerIndex){
      this.maximiseChat();
      
      // display player name or ST in the chat title
      if(this.session.isSpectator){
        this.$refs.chatWith.innerText = "说书人";
        this.$store.commit("session/setStMessage", 0);
      }else{
        const name = this.players[playerIndex].name;
        // name = name.split(". ")[1];
        this.$refs.chatWith.innerText = name;
        this.chattingPlayer = this.players[playerIndex].id;
        this.$store.commit("players/setPlayerMessage", {playerId: this.chattingPlayer, num: 0})
      }

      this.scrollToBottom();
    },
    toggleChat(){
      if(this.isChatMin){
        this.maximiseChat();
      }else{
        this.minimiseChat();
      }
    },
    maximiseChat(){
      if(this.minimising){
        this.minimising = false;
        return;
      }
      this.isChatOpen = true;
      this.isChatMin = false;
    },
    minimiseChat(){
      this.isChatMin = true;
      this.minimising = true;
    },
    sendChat(){
      if (this.message === "") return;
      const sender = this.session.isSpectator ? this.session.playerName : "说书人";
      const playerId = this.session.isSpectator ? this.session.playerId : this.chattingPlayer;
      const message = sender.concat(": ", this.message);
      this.$store.commit("session/updateChatSent", {message, playerId});
      this.message = "";

      this.scrollToBottom();
    },
    scrollToBottom(){
      this.$refs.chatContent.scrollTop = this.$refs.chatContent.scrollHeight;
    },
    checkToBottom() {
      if (this.$refs.chatContent.scrollTop === 0){
        // scrolled to bottom
        if (!this.session.isSpectator) {
          this.$store.commit("players/setPlayerMessage", {playerId: this.chattingPlayer, num: 0});
        } else{
          this.$store.commit("session/setStMessage", 0);
        }
      }
    },
    typing(){
      this.session.chatting = true;
      if (!this.session.isSpectator) {
        this.$store.commit("players/setPlayerMessage", {playerId: this.chattingPlayer, num: 0});
      } else{
        this.$store.commit("session/setStMessage", 0);
      }
    }
  }
};
</script>

<style lang="scss">
@use "sass:math";
@import "../vars.scss";

#townsquare {
  width: 100%;
  height: 100%;
  padding: 20px;
  display: flex;
  align-items: center;
  align-content: center;
  justify-content: center;
}

.circle {
  padding: 0;
  width: 100%;
  height: 100%;
  list-style: none;
  margin: 0;

  > li {
    position: absolute;
    left: 50%;
    height: 50%;
    transform-origin: 0 100%;
    pointer-events: none;

    &:hover {
      z-index: 25 !important;
    }

    > .player {
      margin-left: -50%;
      width: 100%;
      pointer-events: all;
    }
    > .reminder {
      margin-left: -25%;
      width: 50%;
      pointer-events: all;
    }
  }
}

@mixin on-circle($item-count) {
  $angle: math.div(360, $item-count);
  $rot: 0;

  // rotation and tooltip placement
  @for $i from 1 through $item-count {
    &:nth-child(#{$i}) {
      transform: rotate($rot * 1deg);
      @if $i - 1 <= math.div($item-count, 2) {
        // first half of players
        z-index: $item-count - $i + 1;
        // open menu on the left
        .player > .menu {
          left: auto;
          right: 110%;
          margin-right: 15px;
          &:before {
            border-left-color: black;
            border-right-color: transparent;
            right: auto;
            left: 100%;
          }
        }
        .fold-enter-active,
        .fold-leave-active {
          transform-origin: right center;
        }
        .fold-enter,
        .fold-leave-to {
          transform: perspective(200px) rotateY(-90deg);
        }
        // show ability tooltip on the left
        .ability {
          right: 120%;
          left: auto;
          &:before {
            border-right-color: transparent;
            border-left-color: black;
            right: auto;
            left: 100%;
          }
        }
        .pronouns {
          left: 110%;
          right: auto;
          &:before {
            border-left-color: transparent;
            border-right-color: black;
            left: auto;
            right: 100%;
          }
        }
      } @else {
        // second half of players
        z-index: $i - 1;
      }

      > * {
        transform: rotate($rot * -1deg);
      }

      // animation cascade
      .life,
      .token,
      .shroud,
      .night-order,
      .seat {
        animation-delay: ($i - 1) * 50ms;
        transition-delay: ($i - 1) * 50ms;
      }

      // move reminders closer to the sides of the circle
      $q: math.div($item-count, 4);
      $x: $i - 1;
      @if $x < $q or ($x >= math.div($item-count, 2) and $x < $q * 3) {
        .player {
          margin-bottom: -10% + 20% * (1 - math.div($x % $q, $q));
        }
      } @else {
        .player {
          margin-bottom: -10% + 20% * math.div($x % $q, $q);
        }
      }
    }
    $rot: $rot + $angle;
  }
}

@for $i from 1 through 20 {
  .circle.size-#{$i} > li {
    @include on-circle($item-count: $i);
  }
}

/***** Demon bluffs / Fabled *******/
#townsquare > .bluffs,
#townsquare > .fabled {
  position: absolute;
  &.bluffs {
    bottom: 10px;
  }
  &.fabled {
    top: 10px;
  }
  left: 10px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 10px;
  border: 3px solid black;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
  transform-origin: bottom left;
  transform: scale(1);
  opacity: 1;
  transition: all 200ms ease-in-out;
  z-index: 50;

  > svg {
    position: absolute;
    top: 10px;
    right: 10px;
    cursor: pointer;
    &:hover {
      color: red;
    }
  }
  h3 {
    margin: 5px 1vh 0;
    display: flex;
    align-items: center;
    align-content: center;
    justify-content: center;
    span {
      flex-grow: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    svg {
      cursor: pointer;
      flex-grow: 0;
      &.fa-times-circle {
        margin-left: 0vh;
      }
      &.fa-plus-circle {
        margin-left: 0vh;
        display: none;
      }
      &:hover path {
        fill: url(#demon);
        stroke-width: 30px;
        stroke: white;
      }
    }
  }
  ul {
    display: flex;
    align-items: center;
    justify-content: center;
    li {
      // width: 14vh;
      // height: 14vh;
      margin: 0 0.5%;
      display: inline-block;
      transition: all 250ms;
    }
  }
  &.closed {
    svg.fa-times-circle {
      display: none;
    }
    svg.fa-plus-circle {
      display: block;
    }
    ul li {
      width: 0;
      height: 0;
      .night-order {
        opacity: 0;
      }
      .token {
        border-width: 0;
      }
    }
  }
}

#townsquare.public > .bluffs {
  opacity: 0;
  transform: scale(0.1);
}

.fabled ul li .token:before {
  content: " ";
  opacity: 0;
  transition: opacity 250ms;
  background-image: url("../assets/icons/x.png");
  z-index: 2;
}

// New message bubble
.fabled ul li .newMessage {
  position: absolute;
  right: 2%;
  top: 1%;
  background: rgb(255, 51, 85);
  border-radius: 100%;
  width: 20px;
  height: 20px;
  text-align: center;
  font-size: 80%;
}


/**** Night reminders ****/
.night-order {
  position: absolute;
  width: 100%;
  cursor: pointer;
  opacity: 1;
  transition: opacity 200ms;
  display: flex;
  top: 0;
  align-items: center;
  pointer-events: none;

  &:after {
    content: " ";
    display: block;
    padding-top: 100%;
  }

  #townsquare.public & {
    opacity: 0;
    pointer-events: none;
  }

  &:hover ~ .token .ability {
    opacity: 0;
  }

  span {
    display: flex;
    position: absolute;
    padding: 5px 10px 5px 30px;
    width: 350px;
    z-index: 25;
    font-size: 70%;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 10px;
    border: 3px solid black;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
    text-align: left;
    align-items: center;
    opacity: 0;
    transition: opacity 200ms ease-in-out;

    &:before {
      transform: rotate(-90deg);
      transform-origin: center top;
      left: -98px;
      top: 50%;
      font-size: 100%;
      position: absolute;
      font-weight: bold;
      text-align: center;
      width: 200px;
    }

    &:after {
      content: " ";
      border: 10px solid transparent;
      width: 0;
      height: 0;
      position: absolute;
    }
  }

  &.first span {
    right: 120%;
    background: linear-gradient(
      to right,
      $townsfolk 0%,
      rgba(0, 0, 0, 0.5) 20%
    );
    &:before {
      content: "首夜";
    }
    &:after {
      border-left-color: $townsfolk;
      margin-left: 3px;
      left: 100%;
    }
  }

  &.other span {
    left: 120%;
    background: linear-gradient(to right, $demon 0%, rgba(0, 0, 0, 0.5) 20%);
    &:before {
      content: "其他夜";
    }
    &:after {
      right: 100%;
      margin-right: 3px;
      border-right-color: $demon;
    }
  }

  em {
    font-style: normal;
    position: absolute;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid black;
    filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.5));
    font-weight: bold;
    opacity: 1;
    pointer-events: all;
    transition: opacity 200ms;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 3;
  }

  &.first em {
    left: -10%;
    background: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, $townsfolk 100%);
  }

  &.other em {
    right: -10%;
    background: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, $demon 100%);
  }

  em:hover + span {
    opacity: 1;
  }

  // adjustment for fabled
  .fabled &.first {
    span {
      right: auto;
      left: 40px;
      &:after {
        left: auto;
        right: 100%;
        margin-left: 0;
        margin-right: 3px;
        border-left-color: transparent;
        border-right-color: $townsfolk;
      }
    }
  }
}


/* chat with ST */
.chatMin {
    position: absolute;
    right: 10px;
    bottom: 10px;
    transform-origin: bottom right;
    width: 15%;
    height: 5%;
    border-radius: 10px;
    z-index: 100;
    display: flex;
    flex-direction: column;
}

.chatMin .title {
    padding: 10px;
    background-color: #000;
    user-select: none;
}

.chatMin .title .open {
    position: absolute;
    right: 20px;
    font-weight: bold;
    cursor: pointer;
}

.chatMin .content {
    display: none;
}

.chatMin .chatbox {
    display: none;
}
// New message bubble
.chatMin .newMessage {
  position: absolute;
  left: 40%;
  top: 30%;
  background: rgb(255, 51, 85);
  border-radius: 100%;
  width: 20px;
  height: 20px;
  text-align: center;
  font-size: 80%;
}

.chat {
    position: absolute;
    right: 10px;
    bottom: 10px;
    transform-origin: bottom right;
    background-color: #0000007f;
    // width: 30%;
    // height: 40%;
    border-radius: 10px;
    border: 3px solid #8a7864;
    z-index: 100;
    display: flex;
    flex-direction: column;
}
// New message bubble
.chat .newMessage {
  position: absolute;
  left: 25%;
  top: 30%;
  background: rgb(255, 51, 85);
  border-radius: 100%;
  width: 20px;
  height: 20px;
  text-align: center;
  font-size: 80%;
}

// .chat.focus, .chat:hover {
//     z-index: 100;
// }

.chat .title {
    padding: 10px;
    background-color: #000;
    user-select: none;
}

.chat .title .close {
    position: absolute;
    right: 20px;
    font-weight: bold;
    cursor: pointer;
}

.chat.alert .title {
    background-color: #A00;
}

.chat.alert .title::after {
    font-size: 70%;
    font-weight: bold;
    position: absolute;
    right: 40px;
    bottom: 10px;
}

.chat .content {
    padding: 5px;
    font-size: 80%;
    background-color: #131313;
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
    flex: 1;
    display: flex;
    flex-direction: column-reverse;
}

.chat .chatbox {
    padding: 5px;
    display: flex;
    height: fit-content;
}

.chat .chatbox .edit {
    flex: 1;
    overflow-x: hidden;
    overflow-y: auto;
    max-height: 60px;
    font-size: 70%;
    border: solid;
    background-color: #000;
    color: #fff;
}

.chat .chatbox .edit:focus {
    outline: none;
}

.chat .chatbox .send {
    background-color: #4a7ec6;
    color: white;
    border: solid;
    border-color: white;
    border-radius: 0 10px 10px 0;
    cursor: pointer;
}

.turnedIcon45 {
  transform: rotate(45deg);
}

.toBottom {
  margin: auto;
  width: 40px;
  height: 20px;
  bottom: 30px;
  z-index: 100;
  font-size: 70%;
  display: flex;
  flex-direction: column;
}

#townsquare:not(.spectator) .fabled ul li:hover .token:before {
  opacity: 1;
}
</style>
