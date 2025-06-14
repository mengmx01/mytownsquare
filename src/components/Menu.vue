<template>
  <div id="controls">
    <span v-if="!!session.sessionId & session.isSpectator">
      <font-awesome-icon icon="microphone" v-if="microphoneSetting === 'free' && listeningFrame"
      @click="stopListening(microphoneSetting)"
      />
      <font-awesome-icon icon="microphone-slash" v-if="microphoneSetting === 'free' && !listeningFrame"
      @click="startListening(microphoneSetting)"
      />
      <font-awesome-icon icon="keyboard" v-if="microphoneSetting === 'keyboard'" :style="keyboardIcon"/>
      
      <select v-show="!isHandHeld" id="microphone" v-model="microphoneSetting" @change="stopListening(microphoneSetting)">
        <option value="free">自由发言</option>
        <option value="keyboard">按f2发言</option>
      </select>
    </span>

    <span v-if="session.sessionId">
      <button v-if="!timing && !session.isSpectator" @click="startTimer" class="timerButton">开始</button>
      <button v-if="timing && !session.isSpectator" @click="stopTimer" class="timerButton">停止</button>
      <span style="font-size: 20px;" @click="setTimer">
        <span>计时 </span>
        <span :style="lessThanOneMinute">{{ formattedTime }}</span>
      </span>
    </span>

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
          <div class="options">
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
            <li @click="$emit('trigger', ['uploadAvatar'])">
              上传头像
              <em><font-awesome-icon icon="user"/></em>
            </li>
            <li @click="changeName">
              设置昵称
              <em><font-awesome-icon icon="user-edit"/></em>
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
            <li v-if="!edition.isOfficial" @click="toggleForwardEvilInfo">
              <small>提前邪恶互认和信息</small>
              <em
                ><font-awesome-icon
                  :icon="[
                    'fas',
                    grimoire.isForwardEvilInfo ? 'check-square' : 'square'
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
            <li v-if="!session.isSpectator" @click="toggleUseOldOrder">
              使用原夜间顺序
              <em
                ><font-awesome-icon
                  :icon="['fas', session.isUseOldOrder ? 'check-square' : 'square']"
              /></em>
            </li>
            <li @click="toggleMuted">
              静音
              <em
                ><font-awesome-icon
                  :icon="['fas', grimoire.isMuted ? 'volume-mute' : 'volume-up']"
              /></em>
            </li>
            <li @click="clearLocalStorage">
              清空储存
              <em
                ><font-awesome-icon icon="trash-alt"/></em>
            </li>
          </div>
        </template>

        <template v-if="tab === 'session'">
          <!-- Session -->
          <li class="headline" v-if="session.sessionId">
            {{ session.isSpectator ? "玩家" : "说书人" }}
          </li>
          <li class="headline" v-else>
            联机
          </li>
          <div class="options">
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
              <li v-if="!session.isSpectator" @click="distributeAsk">
                发送角色
                <em><font-awesome-icon icon="theater-masks"/></em>
              </li>
              <li v-if="!session.isSpectator" @click="distributeTypeAsk">
                发送角色类型
              </li>
              <li v-if="!session.isSpectator" @click="distributeBluffsAsk">
                发送伪装身份
                <em><font-awesome-icon icon="hat-wizard"/></em>
              </li>
              <li v-if="!session.isSpectator" @click="distributeGrimoireAsk">
                发送魔典
                <em><font-awesome-icon icon="book"/></em>
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
          </div>
        </template>

        <template v-if="tab === 'players' && !session.isSpectator">
          <!-- Users -->
          <li class="headline">玩家</li>
          <div class="options">
            <li @click="addPlayer" v-if="players.length < 20">添加座位<!--<em>[A]</em>--></li>
            <li @click="randomizeSeatings" v-if="players.length > 2">
              随机座位
              <em><font-awesome-icon icon="dice"/></em>
            </li>
            <li @click="clearPlayers" v-if="players.length">
              移除全部
              <em><font-awesome-icon icon="trash-alt"/></em>
            </li> 
          </div>
        </template>

        <template v-if="tab === 'characters'">
          <!-- Characters -->
          <li class="headline">角色</li>
          <div class="options">
            <li v-if="!session.isSpectator" @click="toggleModal('edition')">
              选择剧本
              <em>[E]</em>
            </li>
            <li @click="selectEditionsAsk()">
              <small>
                选择全角色合集范围
              </small>
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
            <li v-if="!session.isSpectator" @click="customiseBootlegger">
              <small>
                自定义私货商人
              </small>
              <em>[B]</em>
            </li>
            <li @click="clearRoles" v-if="players.length">
              移除全部
              <em><font-awesome-icon icon="trash-alt"/></em>
            </li>
          </div>
        </template>

        <template v-if="tab === 'help'">
          <!-- Help -->
          <li class="headline">帮助</li>
          <div>
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
          </div>
        </template>
      </ul>
    </div>

    <div v-if="distributing" class="dialog">
      <span>
        <label>是否同时给恶魔（疯子）发送伪装身份？</label>
        <input type="checkbox" v-model="isSendingBluff" class="checkbox"/>
      </span>
      <div>
        <button @click="distributeRoles(true)">确定</button>
        <button @click="distributeRoles(false)">取消</button>
      </div>
    </div>
    <div v-if="distributingBluffs" class="dialog">
      <span>
        <label>发送伪装身份给：</label>
      </span>
      <div>
        <button @click="distributeBluffs('demon')">恶魔</button>
        <button @click="distributeBluffs('lunatic')">疯子</button>
        <button @click="distributeBluffs('snitch')">爪牙（告密者）</button>
        <button @click="distributeBluffs('')">取消</button>
      </div>
    </div>
    <div v-if="distributingGrimoire" class="dialog">
      <span>
        <label>发送魔典给：</label>
      </span>
      <div>
        <button @click="distributeGrimoire('widow')">寡妇</button>
        <button @click="distributeGrimoire('spy')">间谍</button>
        <button @click="distributeGrimoire('')">取消</button>
      </div>
    </div>
    <div v-if="selectingEditions" class="dialog">
      <span>
        <b>请选择全角色合集的剧本范围（该功能仅对自己生效{{ !session.isSpectator ? "，请说书人公开通知玩家" : "" }}）</b>
      </span>
      <br>
      <span>
        <label>暗流涌动</label>
        <input type="checkbox" v-model="pendingEditions.tb" class="checkbox"/>
      </span>
      &emsp;
      <span>
        <label>暗月初生</label>
        <input type="checkbox" v-model="pendingEditions.bmr" class="checkbox"/>
      </span>
      &emsp;
      <span>
        <label>梦殒春宵</label>
        <input type="checkbox" v-model="pendingEditions.snv" class="checkbox"/>
      </span>
      &emsp;
      <span>
        <label>实验性角色</label>
        <input type="checkbox" v-model="pendingEditions.exp" class="checkbox"/>
      </span>
      &emsp;
      <span>
        <label>华灯初上</label>
        <input type="checkbox" v-model="pendingEditions.hdcs" class="checkbox"/>
      </span>
      &emsp;
      <span>
        <label>山雨欲来</label>
        <input type="checkbox" v-model="pendingEditions.syyl" class="checkbox"/>
      </span>
      &emsp;
      <div>
        <button @click="selectEditions(true)">确定</button>
        <button @click="selectEditions(false)">取消</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapMutations, mapState } from "vuex";

export default {
  computed: {
    ...mapState(["grimoire", "session", "edition", "channels", "selectedEditions"]),
    ...mapState("players", ["players"]),
    formattedTime() {
      const minutes = Math.floor(this.session.timer / 60);
      const seconds = this.session.timer % 60;
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    },
    lessThanOneMinute() {
      return {
        color: this.session.timer < 60 ? 'red' : 'white'
      }
    },
    keyboardIcon() {
      return {
        color: this.listeningFrame ? 'red' : 'white'
      }
    },
    isHandHeld() {
      const deviceType = navigator.userAgent.toLocaleLowerCase();
      console.log(deviceType);
      if (/mobile|android|touch|webos|iphone|ipod/i.test(deviceType)) return true;
      return false;
    }
  },
  data() {
    return {
      tab: "grimoire",
      timing: false,
      distributing: false,
      distributingBluffs: false,
      distributingGrimoire: false,
      distributingTypes: false,
      isSendingBluff: true,
      selectingEditions: false,
      pendingEditions: {
        tb: true,
        bmr: true,
        snv: true,
        exp: true,
        hdcs: true,
        syyl: true
      },
      recognition: null,
      microphoneSetting: "free",
      // 语音检测
      audioContext: null,
      audioStream: null,
      analyser: null,
      source: null,
      listeningFrame: null // also in session.js for global reference
    };
  },
  methods: {
    setBackground() {
      const background = prompt("输入自定义背景图URL");
      if (background || background === "") {
        this.$store.commit("setBackground", background);
      }
    },
    changeName() {
      var name = prompt("输入玩家昵称").trim();
      if (!name) return; // will not execute because .trim() incurs error first
      while (name === "空座位" || name === "说书人"){
        alert("昵称非法！");
        name = prompt("输入玩家昵称").trim();
        if (!name) return; // will not execute because .trim() incurs error first
      }
      this.$store.commit("session/setPlayerName", name);
    },
    hostSession() {
      if (this.session.sessionId) return;
      if (this.session.rooms === null) {
        alert("网络连接不稳定，请稍等！");
        return;
      }
      let sessionPlaceholder = Math.round(Math.random() * 10000);
      while (this.session.rooms.includes(sessionPlaceholder)) {
        sessionPlaceholder = Math.round(Math.random() * 10000);
      }
      let sessionId = prompt("请输入房间号", sessionPlaceholder);
      if (!sessionId) return;
      while (!Number(sessionId) || Number(sessionId) >= 10000) {
        alert("请输入大于0小于10000的数字！");
        let sessionPlaceholder = Math.round(Math.random() * 10000);
        while (this.session.rooms.includes(sessionPlaceholder)) {
          sessionPlaceholder = Math.round(Math.random() * 10000);
        }
        sessionId = prompt("请输入房间号", sessionPlaceholder);
        if (!sessionId) return;
      }
      sessionId = Number(sessionId).toString();
      if (this.session.rooms.includes(sessionId)) {
        alert(`房间"${sessionId}"已经存在说书人！`)
        return;
      }
      // const sessionId = Math.round(Math.random() * 10000).toString();
      var numPlayers = prompt(
        ("正在创建房间" + sessionId + "，请输入玩家人数"), 12
      );
      if (!Number(numPlayers)) return;
      if (numPlayers < 0) return;
      if (!this.session.playerName) this.changeName();
      if (!this.session.playerName) return;
      if (sessionId) {
        this.$store.commit("session/clearVoteHistory", []);
        this.$store.commit("session/setSpectator", false);
        this.$store.commit("session/setSessionId", sessionId);
        numPlayers = Math.min(numPlayers, 20);
        this.$store.commit("players/clear");
        for(let i=0; i < numPlayers; i++){
          this.addPlayer();
        }
        this.copySessionUrl();
      };
    },
    copySessionUrl() {
      const url = window.location.href.split("#")[0];
      const link = url + "#" + this.session.sessionId;
      navigator.clipboard.writeText(link);
    },
    distributeAsk() {
      this.distributingBluffs = false;
      this.distributingGrimoire = false;
      this.distributingTypes = false;
      this.distributing = !this.distributing;
    },
    distributeRoles(confirm) {
      this.distributing = false;
      if (!confirm) return;
      if (this.session.isSpectator) return;
      this.$store.commit("session/distributeRoles", true);
      setTimeout(
        (() => {
          this.$store.commit("session/distributeRoles", false);
        }).bind(this),
        2000
      );
      if (!this.isSendingBluff) return;
      this.$store.commit("session/distributeBluffs", {val: true, param: "demonAll"});
      setTimeout(
        (() => {
          this.$store.commit("session/distributeBluffs", {val:false});
        }).bind(this),
        2000
      );
    },
    distributeTypeAsk() {
      this.distributing = false;
      this.distributingBluffs = false;
      this.distributingGrimoire = false;
      this.distributingTypes = !this.distributingTypes;
      if (confirm("确定要发送角色类型给玩家？")) {
        this.distributeTypes();
      }
    },
    distributeTypes() {
      this.distributingTypes = false;
      if (this.session.isSpectator) return;
      this.$store.commit("session/distributeTypes", true);
      setTimeout(
        (() => {
          this.$store.commit("session/distributeTypes", false);
        }).bind(this),
        2000
      );
    },
    distributeBluffsAsk() {
      this.distributing = false;
      this.distributingGrimoire = false;
      this.distributingTypes = false;
      this.distributingBluffs = !this.distributingBluffs;
    },
    distributeBluffs(role = "") {
      if (!role) {
        this.distributingBluffs = false;
        return;
      }
      
      var roleText = "";
      switch (role) {
        case "demon":
          roleText = "恶魔";
          break;
        case "lunatic":
          roleText = "疯子";
          break;
        case "snitch":
          roleText = "爪牙";
          break;
      }

      if (confirm("确定要发送伪装身份给" + roleText + "？")) {
        if (this.session.isSpectator) return;
        this.$store.commit("session/distributeBluffs", {val: true, param: role});
        setTimeout(
          (() => {
            this.$store.commit("session/distributeBluffs", {val:false});
          }).bind(this),
          2000
        );
        this.distributingBluffs = false;
      }
    },
    distributeGrimoireAsk(){
      this.distributing = false;
      this.distributingBluffs = false;
      this.distributingTypes = false;
      this.distributingGrimoire = !this.distributingGrimoire
    },
    distributeGrimoire(role = ""){

      if (!role) {
        this.distributingGrimoire = false;
        return;
      }
      
      var roleText = "";
      switch (role) {
        case "widow":
          roleText = "寡妇";
          break;
        case "spy":
          roleText = "间谍";
          break;
      }

      if (confirm("确定要发送魔典给" + roleText + "？")) {
        if (this.session.isSpectator) return;
        this.$store.commit("session/distributeGrimoire", {val: true, param: role});
        setTimeout(
          (() => {
            this.$store.commit("session/distributeGrimoire", {val:false});
          }).bind(this),
          2000
        );
        this.distributingGrimoire = false;
      }
    },
    selectEditionsAsk() {
      this.pendingEditions = {...this.selectedEditions};
      this.selectingEditions = true;
    },
    selectEditions(update = false) {
      this.selectingEditions = false;
      if (!update) return;
      this.$store.commit("setSelectedEditions", this.pendingEditions);
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
      if (this.session.rooms === null) {
        alert("网络连接不稳定，请稍等！");
        return;
      }
      let sessionId = prompt(
        "输入房间号/链接"
      );
      if (!sessionId) return;
      if (!this.session.playerName) this.changeName();
      if (!this.session.playerName) return;
      if (sessionId.match(/^https?:\/\//i)) {
        sessionId = sessionId.split("#").pop();
      }
      if (!this.session.rooms.includes(sessionId)) {
        alert(`房间"${sessionId}"不存在！`)
        return;
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
        this.$store.commit("session/claimSeat", -1);

        this.$store.commit("session/setSpectator", false);
        this.$store.commit("session/setSessionId", "");
        this.$store.commit("session/setIsHostAllowed", null);
        this.$store.commit("session/setIsJoinAllowed", null);
        
        // clear seats and return to intro
        if (this.session.nomination) {
          this.$store.commit("session/nomination");
        }
        this.$store.commit("players/clear", true);

        // clear customBootlegger
        if (this.session.bootlegger) {
          this.$store.commit("session/setBootlegger", "");
        }

        // reset secret vote
        if (this.session.isSecretVote) {
          this.$store.commit("session/setSecretVote", false);
        }
        // reset using older night order
        if (this.session.isSecretVote) {
          this.$store.commit("session/setUseOldOrder", false);
        }

        // close chat box
        this.$store.commit("session/setChatOpen", false);
      }
    },
    addPlayer(stImage = null, stName = null) {
      if (this.session.isSpectator) return;
      if (this.players.length >= 20) return;
      
      // setting name to a default value, combining with the seat number
      this.$store.commit("players/add", {name: "", stImage, stName});
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
        if (this.session.sessionId) {
          this.$store.commit("players/clear");
        } else {
          this.$store.commit("players/clear", true)
        }
      }
    },
    clearRoles() {
      if (confirm("确定要移除所有玩家角色吗？")) {
        this.$store.dispatch("players/clearRoles");
      }
    },
    customiseBootlegger() {
      if (this.session.isSpectator) return;

      let content = prompt("输入私货商人内容", this.session.bootlegger);
      if (content == null) return;

      const trimmedContent = content.trim();
      this.$store.commit("session/setBootlegger", trimmedContent);
    },
    toggleNight() {
      this.$store.commit("toggleNight");
      if (this.grimoire.isNight) {
        this.$store.commit("session/setMarkedPlayer", -1);
      }
    },
    toggleUseOldOrder() {
      this.$store.commit("session/setUseOldOrder", !this.session.isUseOldOrder);
    },
    setTimer() {
      if (this.session.isSpectator || !this.session.sessionId) return;
      const time = prompt("输入时间（分）");
      const timeNum = Number(time);
      if (!timeNum) return;
      if (timeNum <= 0) return;
      this.timing = true;
      this.stopTimer();
      this.startTimer(timeNum * 60);
    },
    startTimer(time = null) {
      if (this.session.isSpectator) return;
      if (typeof time != 'number') time = this.session.timer;
      this.$store.commit("session/startTimer", time);
      this.timing = true;
    },
    stopTimer() {
      if (this.session.isSpectator) return;
      this.$store.commit("session/stopTimer");
      this.timing = false;
    },
    async initAudio() {
      // Initialize audioContext and audioStream if not already done
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioStream = stream;

        this.source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.source.connect(this.analyser);
      }
    },
    runAudioDetection() {
      // Web Audio API 语音检测
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const SILENCE_THRESHOLD = 120; // Adjust as needed
      const HUMAN_VOICE_RANGE = { min: 250, max: 400 }; // Adjust based on actual FFT resolution

      // Check for microphone activity
      const detectSpeechActivity = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        // Analyze frequency bins corresponding to the human voice range
        const sampleRate = this.audioContext.sampleRate;
        const binCount = this.analyser.frequencyBinCount;
        const binSize = sampleRate / (2 * binCount);
        let totalVolume = 0;
        for (let i = 0; i < binCount; i++) {
          const frequency = i * binSize;
          if (frequency >= HUMAN_VOICE_RANGE.min && frequency <= HUMAN_VOICE_RANGE.max) {
            totalVolume += dataArray[i];
          }
        }

        if (totalVolume > SILENCE_THRESHOLD && !this.session.isTalking) {
          if (!this.session.isTalking) {
            this.$store.commit("session/setTalking", {seatNum:this.session.claimedSeat, isTalking: true});
          }
        } else if (totalVolume <= SILENCE_THRESHOLD && this.session.isTalking) {
          if (this.session.isTalking) {
            this.$store.commit("session/setTalking", {seatNum:this.session.claimedSeat, isTalking: false});
          }
        }

        this.listeningFrame = requestAnimationFrame(detectSpeechActivity);
        this.$store.commit("session/setListeningFrame", this.listeningFrame);
      }

      detectSpeechActivity();
    },
    startListening(mode) {
      if (this.listeningFrame) return;
      if (mode != this.microphoneSetting) return;
      
      this.initAudio().then(() => {
        this.runAudioDetection();
      })
    },
    stopListening(mode) {
      if (!this.listeningFrame) return;
      if (mode != this.microphoneSetting) return;

      if (this.listeningFrame) {
        cancelAnimationFrame(this.listeningFrame);
        this.listeningFrame = null;
        this.$store.commit("session/setListeningFrame", null);
      }
      this.$store.commit("session/setTalking", {seatNum:this.session.claimedSeat, isTalking: false});
    },
    clearLocalStorage() {
      const clear = confirm("确定清空所有内容吗？（将清除昵称头像和聊天记录等）");
      if (!clear) return;
      localStorage.clear();
      alert("清理完成，请刷新网页！");
    },
    ...mapMutations([
      "toggleGrimoire",
      "toggleMenu",
      "toggleImageOptIn",
      "toggleForwardEvilInfo",
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

/* width */
::-webkit-scrollbar {
  width: 5px;
}
/* Handle */
::-webkit-scrollbar-thumb {
  background: rgb(54, 54, 54); 
  border-radius: 10px;
}

/* Handle on hover */
::-webkit-scrollbar-thumb:hover {
  background: rgb(97, 97, 97); 
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

    .options {
      overflow-y: auto;
      max-height: calc(85vh - 100px); /* Adjust this value as needed */
    }

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

.timerButton {
  // opacity: 0.5;
  background-color: rgba(0,0,0,0.5);
  border-radius: 5px 5px 5px 5px;
  right: 8px;
  border: white;
  color: white;
  cursor: pointer;
}

.dialog {
  background-color: #000;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 5px;
  text-align: center;
}

.dialog .checkbox {
  width: 20px;
  height: 20px;
}
</style>
