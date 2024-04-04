<template>
  <div id="controls">
    <span
      class="nomlog-summary"
      v-show="session.voteHistory.length && session.sessionId"
      @click="toggleModal('voteHistory')"
      :title="
        `${session.voteHistory.length} recent ${
          session.voteHistory.length == 1 ? 'nomination' : 'nominations'
        }`
      "
    >
      <font-awesome-icon icon="book-dead" />
      {{ session.voteHistory.length }}
    </span>
    <span
      class="session"
      :class="{
        spectator: session.isSpectator,
        reconnecting: session.isReconnecting
      }"
      v-if="session.sessionId"
      @click="leaveSession"
      :title="
        `${session.playerCount} other players in this session${
          session.ping ? ' (' + session.ping + 'ms latency)' : ''
        }`
      "
    >
      <font-awesome-icon icon="broadcast-tower" />
      {{ session.playerCount }}
    </span>
    <div class="menu" :class="{ open: grimoire.isMenuOpen }">
      <font-awesome-icon icon="cog" @click="toggleMenu" />
      <ul>
        <li class="tabs" :class="tab">
          <font-awesome-icon icon="book-open" @click="tab = 'grimoire'" />
          <font-awesome-icon icon="broadcast-tower" @click="tab = 'session'" />
          <font-awesome-icon
            icon="users"
            v-if="!session.isSpectator"
            @click="tab = 'players'"
          />
          <font-awesome-icon icon="theater-masks" @click="tab = 'characters'" />
          <font-awesome-icon icon="question" @click="tab = 'help'" />
        </li>

        <template v-if="tab === 'grimoire'">
          <!-- Grimoire -->
          <li class="headline">魔典</li>
          <li @click="toggleGrimoire" v-if="players.length">
            <template v-if="!grimoire.isPublic">隐藏</template>
            <template v-if="grimoire.isPublic">显示</template>
            <em>[G]</em>
          </li>
          <li @click="toggleNight" v-if="!session.isSpectator">
            <template v-if="!grimoire.isNight">切换至夜晚</template>
            <template v-if="grimoire.isNight">切换至白天</template>
            <em>[S]</em>
          </li>
          <li @click="toggleNightOrder" v-if="players.length">
            夜间顺序
            <em>
              <font-awesome-icon
                :icon="[
                  'fas',
                  grimoire.isNightOrder ? 'check-square' : 'square'
                ]"
              />
            </em>
          </li>
          <li v-if="players.length">
            缩放
            <em>
              <font-awesome-icon
                @click="setZoom(grimoire.zoom - 1)"
                icon="search-minus"
              />
              {{ Math.round(100 + grimoire.zoom * 10) }}%
              <font-awesome-icon
                @click="setZoom(grimoire.zoom + 1)"
                icon="search-plus"
              />
            </em>
          </li>
          <li @click="setBackground">
            背景图
            <em><font-awesome-icon icon="image"/></em>
          </li>
          <li v-if="!edition.isOfficial" @click="imageOptIn">
            <small>允许自定义图标</small>
            <em
              ><font-awesome-icon
                :icon="[
                  'fas',
                  grimoire.isImageOptIn ? 'check-square' : 'square'
                ]"
            /></em>
          </li>
          <li @click="toggleStatic">
            关闭动画
            <em
              ><font-awesome-icon
                :icon="['fas', grimoire.isStatic ? 'check-square' : 'square']"
            /></em>
          </li>
          <li @click="toggleMuted">
            静音
            <em
              ><font-awesome-icon
                :icon="['fas', grimoire.isMuted ? 'volume-mute' : 'volume-up']"
            /></em>
          </li>
        </template>

        <template v-if="tab === 'session'">
          <!-- Session -->
          <li class="headline" v-if="session.sessionId">
            {{ session.isSpectator ? "玩家" : "说书人" }}
          </li>
          <li class="headline" v-else>
            联机
          </li>
          <template v-if="!session.sessionId">
            <li @click="hostSession">创建房间<em>[H]</em></li>
            <li @click="joinSession">加入房间<em>[J]</em></li>
          </template>
          <template v-else>
            <li v-if="session.ping">
              与{{ session.isSpectator ? "说书人" : "玩家" }}延迟
              <em>{{ session.ping }}ms</em>
            </li>
            <li @click="copySessionUrl">
              复制链接
              <em><font-awesome-icon icon="copy"/></em>
            </li>
            <li v-if="!session.isSpectator" @click="distributeRoles">
              发送角色
              <em><font-awesome-icon icon="theater-masks"/></em>
            </li>
            <li
              v-if="session.voteHistory.length || !session.isSpectator"
              @click="toggleModal('voteHistory')"
            >
              投票记录<em>[V]</em>
            </li>
            <li @click="leaveSession">
              <span v-if="session.isSpectator">退出房间</span>
              <span v-if="!session.isSpectator">解散房间</span>
              <em>{{ session.sessionId }}</em>
            </li>
          </template>
        </template>

        <template v-if="tab === 'players' && !session.isSpectator">
          <!-- Users -->
          <li class="headline">玩家</li>
          <li @click="addPlayer" v-if="players.length < 20">添加座位<!--<em>[A]</em>--></li>
          <li @click="randomizeSeatings" v-if="players.length > 2">
            随机座位
            <em><font-awesome-icon icon="dice"/></em>
          </li>
          <li @click="clearPlayers" v-if="players.length">
            移除全部
            <em><font-awesome-icon icon="trash-alt"/></em>
          </li>
        </template>

        <template v-if="tab === 'characters'">
          <!-- Characters -->
          <li class="headline">角色</li>
          <li v-if="!session.isSpectator" @click="toggleModal('edition')">
            选择剧本
            <em>[E]</em>
          </li>
          <li
            @click="toggleModal('roles')"
            v-if="!session.isSpectator && players.length > 4"
          >
            配置角色
            <em>[C]</em>
          </li>
          <li v-if="!session.isSpectator" @click="toggleModal('fabled')">
            添加传奇角色
            <em>[F]</em>
          </li>
          <li @click="clearRoles" v-if="players.length">
            移除全部
            <em><font-awesome-icon icon="trash-alt"/></em>
          </li>
        </template>

        <template v-if="tab === 'help'">
          <!-- Help -->
          <li class="headline">帮助</li>
          <li @click="toggleModal('reference')">
            角色技能表
            <em>[R]</em>
          </li>
          <li @click="toggleModal('nightOrder')">
            夜间顺序表
            <em>[N]</em>
          </li>
          <li @click="toggleModal('gameState')">
            游戏状态JSON
            <em><font-awesome-icon icon="file-code"/></em>
          </li>
          <!-- <li>
            <a href="https://discord.gg/Gd7ybwWbFk" target="_blank">
              Join Discord
            </a>
            <em>
              <a href="https://discord.gg/Gd7ybwWbFk" target="_blank">
                <font-awesome-icon :icon="['fab', 'discord']" />
              </a>
            </em>
          </li> -->
          <li>
            <a href="https://github.com/bra1n/townsquare" target="_blank">
              源代码
            </a>
            <em>
              <a href="https://github.com/bra1n/townsquare" target="_blank">
                <font-awesome-icon :icon="['fab', 'github']" />
              </a>
            </em>
          </li>
        </template>
      </ul>
    </div>
  </div>
</template>

<script>
import { mapMutations, mapState } from "vuex";

export default {
  computed: {
    ...mapState(["grimoire", "session", "edition"]),
    ...mapState("players", ["players"])
  },
  data() {
    return {
      tab: "grimoire"
    };
  },
  methods: {
    setBackground() {
      const background = prompt("输入自定义背景图URL");
      if (background || background === "") {
        this.$store.commit("setBackground", background);
      }
    },
    hostSession() {
      if (this.session.sessionId) return;
      const sessionId = Math.round(Math.random() * 10000).toString();
      var numPlayers = prompt(
        ("正在创建房间" + sessionId + "，请输入玩家人数"), 12
      );
      if (sessionId) {
        this.$store.commit("session/clearVoteHistory");
        this.$store.commit("session/setSpectator", false);
        this.$store.commit("session/setSessionId", sessionId);
        this.copySessionUrl();
      };
      if (numPlayers > 0){
        this.$store.commit("players/clear");
        for(let i=0; i < numPlayers; i++){
          this.addPlayer();
        }
      };
    },
    copySessionUrl() {
      const url = window.location.href.split("#")[0];
      const link = url + "#" + this.session.sessionId;
      navigator.clipboard.writeText(link);
    },
    distributeRoles() {
      if (this.session.isSpectator) return;
      const popup =
        "确定将角色发送给所有已入座的玩家吗？";
      if (confirm(popup)) {
        this.$store.commit("session/distributeRoles", true);
        setTimeout(
          (() => {
            this.$store.commit("session/distributeRoles", false);
          }).bind(this),
          2000
        );
      }
    },
    imageOptIn() {
      const popup =
        "确定要启用自定义游戏图标吗？木马剧本拥有者可能以此来追踪你的IP地址。";
      if (this.grimoire.isImageOptIn || confirm(popup)) {
        this.toggleImageOptIn();
      }
    },
    joinSession() {
      if (this.session.sessionId) return this.leaveSession();
      let sessionId = prompt(
        "输入房间号/链接"
      );
      if (!sessionId) return;
      var name = prompt("输入玩家昵称").trim();
      if (!name) return; //will not execute because .trim() incurs error first
      while (name === "空座位"){
        alert("昵称非法！");
        name = prompt("输入玩家昵称").trim();
        if (!name) return; //will not execute because .trim() incurs error first
      }
      this.$store.commit("session/setPlayerName", name);
      if (sessionId.match(/^https?:\/\//i)) {
        sessionId = sessionId.split("#").pop();
      }
      if (sessionId) {
        this.$store.commit("session/clearVoteHistory");
        this.$store.commit("session/setSpectator", true);
        this.$store.commit("toggleGrimoire", false);
        this.$store.commit("session/setSessionId", sessionId);
      }
    },
    leaveSession() {
      if (confirm("确定要离开/解散该房间吗？")) {
        // vacate seat upon leaving the room
        const playerIndex = this.session.claimedSeat;
        if (playerIndex >= 0){
          if (this.session.playerId === this.players[playerIndex].id) {
            this.$store.commit("session/claimSeat", -1);
          } else {
            this.$store.commit("session/claimSeat", playerIndex);
          }
        }

        this.$store.commit("session/setSpectator", false);
        this.$store.commit("session/setSessionId", "");
        // this.$store.commit("session/setPlayerName", "空座位");
      }
    },
    addPlayer() {
      if (this.session.isSpectator) return;
      if (this.players.length >= 20) return;
      
      // setting name to a default value, combining with the seat number
      this.$store.commit("players/add", "");
    },
    randomizeSeatings() {
      if (this.session.isSpectator) return;
      if (confirm("确定要随机分配座位吗？")) {
        this.$store.dispatch("players/randomize");
      }
    },
    clearPlayers() {
      if (this.session.isSpectator) return;
      if (confirm("确定要移除所有座位吗？")) {
        // abort vote if in progress
        if (this.session.nomination) {
          this.$store.commit("session/nomination");
        }
        this.$store.commit("players/clear");
      }
    },
    clearRoles() {
      if (confirm("确定要移除所有玩家角色吗？")) {
        this.$store.dispatch("players/clearRoles");
      }
    },
    toggleNight() {
      this.$store.commit("toggleNight");
      if (this.grimoire.isNight) {
        this.$store.commit("session/setMarkedPlayer", -1);
      }
    },
    ...mapMutations([
      "toggleGrimoire",
      "toggleMenu",
      "toggleImageOptIn",
      "toggleMuted",
      "toggleNightOrder",
      "toggleStatic",
      "setZoom",
      "toggleModal"
    ])
  }
};
</script>

<style scoped lang="scss">
@import "../vars.scss";

// success animation
@keyframes greenToWhite {
  from {
    color: green;
  }
  to {
    color: white;
  }
}

// Controls
#controls {
  position: absolute;
  right: 3px;
  top: 3px;
  text-align: right;
  padding-right: 50px;
  z-index: 75;

  svg {
    filter: drop-shadow(0 0 5px rgba(0, 0, 0, 1));
    &.success {
      animation: greenToWhite 1s normal forwards;
      animation-iteration-count: 1;
    }
  }

  > span {
    display: inline-block;
    cursor: pointer;
    z-index: 5;
    margin-top: 7px;
    margin-left: 10px;
  }

  span.nomlog-summary {
    color: $townsfolk;
  }

  span.session {
    color: $demon;
    &.spectator {
      color: $townsfolk;
    }
    &.reconnecting {
      animation: blink 1s infinite;
    }
  }
}

@keyframes blink {
  50% {
    opacity: 0.5;
    color: gray;
  }
}

.menu {
  width: 220px;
  transform-origin: 200px 22px;
  transition: transform 500ms cubic-bezier(0.68, -0.55, 0.27, 1.55);
  transform: rotate(-90deg);
  position: absolute;
  right: 0;
  top: 0;

  &.open {
    transform: rotate(0deg);
  }

  > svg {
    cursor: pointer;
    background: rgba(0, 0, 0, 0.5);
    border: 3px solid black;
    width: 40px;
    height: 50px;
    margin-bottom: -8px;
    border-bottom: 0;
    border-radius: 10px 10px 0 0;
    padding: 5px 5px 15px;
  }

  a {
    color: white;
    text-decoration: none;
    &:hover {
      color: red;
    }
  }

  ul {
    display: flex;
    list-style-type: none;
    padding: 0;
    margin: 0;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 0 10px black;
    border: 3px solid black;
    border-radius: 10px 0 10px 10px;

    li {
      padding: 2px 5px;
      color: white;
      text-align: left;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 30px;

      &.tabs {
        display: flex;
        padding: 0;
        svg {
          flex-grow: 1;
          flex-shrink: 0;
          height: 35px;
          border-bottom: 3px solid black;
          border-right: 3px solid black;
          padding: 5px 0;
          cursor: pointer;
          transition: color 250ms;
          &:hover {
            color: red;
          }
          &:last-child {
            border-right: 0;
          }
        }
        &.grimoire .fa-book-open,
        &.players .fa-users,
        &.characters .fa-theater-masks,
        &.session .fa-broadcast-tower,
        &.help .fa-question {
          background: linear-gradient(
            to bottom,
            $townsfolk 0%,
            rgba(0, 0, 0, 0.5) 100%
          );
        }
      }

      &:not(.headline):not(.tabs):hover {
        cursor: pointer;
        color: red;
      }

      em {
        flex-grow: 0;
        font-style: normal;
        margin-left: 10px;
        font-size: 80%;
      }
    }

    .headline {
      font-family: PiratesBay, sans-serif;
      letter-spacing: 1px;
      padding: 0 10px;
      text-align: center;
      justify-content: center;
      background: linear-gradient(
        to right,
        $townsfolk 0%,
        rgba(0, 0, 0, 0.5) 20%,
        rgba(0, 0, 0, 0.5) 80%,
        $demon 100%
      );
    }
  }
}
</style>
