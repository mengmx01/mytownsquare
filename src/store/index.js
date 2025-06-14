import Vue from "vue";
import Vuex from "vuex";
import persistence from "./persistence";
import socket from "./socket";
import players from "./modules/players";
import session from "./modules/session";
import editionJSON from "../editions.json";
import rolesJSON from "../roles.json";
import fabledJSON from "../fabled.json";
import jinxesJSON from "../hatred.json";

Vue.use(Vuex);

// helper functions
const getRolesByEdition = (edition = editionJSON[0]) => {
  if (edition.id === 'all') {
    return new Map(
      rolesJSON
        .sort((a, b) => b.team.localeCompare(a.team))
        .map(role => [role.id, role])
    );
  }
  return new Map(
    rolesJSON
      .filter(r => r.edition === edition.id || edition.roles.includes(r.id))
      .sort((a, b) => b.team.localeCompare(a.team))
      .map(role => [role.id, role])
  );
};

const getTravelersNotInEdition = (edition = editionJSON[0]) => {
  return new Map(
    rolesJSON
      .filter(
        r =>
          r.team === "traveler" &&
          r.edition !== edition.id &&
          !edition.roles.includes(r.id)
      )
      .map(role => [role.id, role])
  );
};

const set = key => ({ grimoire }, val) => {
  grimoire[key] = val;
};

const toggle = key => ({ grimoire }, val) => {
  if (val === true || val === false) {
    grimoire[key] = val;
  } else {
    grimoire[key] = !grimoire[key];
  }
};

const clean = id => id.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");

// global data maps
const editionJSONbyId = new Map(
  editionJSON.map(edition => [edition.id, edition])
);
const rolesJSONbyId = new Map(rolesJSON.map(role => [role.id, role]));
const fabled = new Map(fabledJSON.map(role => [role.id, role]));

// jinxes
let jinxes = {};
try {
  // Note: can't fetch live list due to lack of CORS headers
  // fetch("https://bloodontheclocktower.com/script/data/hatred.json")
  //   .then(res => res.json())
  //   .then(jinxesJSON => {
  jinxes = new Map(
    jinxesJSON.map(({ id, hatred }) => [
      clean(id),
      new Map(hatred.map(({ id, reason }) => [clean(id), reason]))
    ])
  );
  // });
} catch (e) {
  console.error("couldn't load jinxes", e);
}

// base definition for custom roles
const customRole = {
  id: "",
  name: "",
  image: "",
  ability: "",
  edition: "custom",
  firstNight: 0,
  firstNightReminder: "",
  otherNight: 0,
  otherNightReminder: "",
  reminders: [],
  remindersGlobal: [],
  setup: false,
  team: "townsfolk",
  isCustom: true
};

export default new Vuex.Store({
  modules: {
    players,
    session
  },
  state: {
    grimoire: {
      isNight: false,
      isNightOrder: true,
      isPublic: false,
      isMenuOpen: false,
      isStatic: false,
      isMuted: false,
      isImageOptIn: true,
      isForwardEvilInfo: false,
      zoom: 0,
      background: ""
    },
    modals: {
      edition: false,
      fabled: false,
      gameState: false,
      nightOrder: false,
      reference: false,
      reminder: false,
      role: false,
      roles: false,
      voteHistory: false
    },
    edition: editionJSONbyId.get("tb"),
    selectedEditions: {
      tb: true,
      bmr: true,
      snv: true,
      exp: true,
      hdcs: true,
      syyl: true
    },
    roles: getRolesByEdition(),
    otherTravelers: getTravelersNotInEdition(),
    fabled,
    jinxes,
    states: [],
    teamsNames: {
      townsfolk: "镇民",
      outsider: "外来者",
      minion: "爪牙",
      demon: "恶魔"
    }
  },
  getters: {
    /**
     * Return all custom roles, with default values and non-essential data stripped.
     * Role object keys will be replaced with a numerical index to conserve bandwidth.
     * @param roles
     * @returns {[]}
     */
    customRolesStripped: ({ roles }) => {
      const customRoles = [];
      const customKeys = Object.keys(customRole);
      const strippedProps = [
        "firstNightReminder",
        "otherNightReminder",
        "isCustom"
      ];
      roles.forEach(role => {
        if (!role.isCustom) {
          customRoles.push({ id: role.id });
        } else {
          const strippedRole = {};
          for (let prop in role) {
            if (strippedProps.includes(prop)) {
              continue;
            }
            const value = role[prop];
            if (customKeys.includes(prop) && value !== customRole[prop]) {
              strippedRole[customKeys.indexOf(prop)] = value;
            }
          }
          customRoles.push(strippedRole);
        }
      });
      return customRoles;
    },
    rolesJSONbyId: () => rolesJSONbyId
  },
  mutations: {
    setZoom: set("zoom"),
    setBackground: set("background"),
    toggleMuted: toggle("isMuted"),
    toggleMenu: toggle("isMenuOpen"),
    toggleNightOrder: toggle("isNightOrder"),
    toggleStatic: toggle("isStatic"),
    toggleNight: toggle("isNight"),
    toggleGrimoire: toggle("isPublic"),
    toggleImageOptIn: toggle("isImageOptIn"),
    toggleForwardEvilInfo:toggle("isForwardEvilInfo"),
    toggleModal({ modals }, name) {
      if (name) {
        modals[name] = !modals[name];
      }
      for (let modal in modals) {
        if (modal === name) continue;
        modals[modal] = false;
      }
    },
    /**
     * Store custom roles
     * @param state
     * @param roles Array of role IDs or full role definitions
     */
    setCustomRoles(state, roles) {
      const processedRoles = roles
        // replace numerical role object keys with matching key names
        .map(role => {
          if (role[0]) {
            const customKeys = Object.keys(customRole);
            const mappedRole = {};
            for (let prop in role) {
              if (customKeys[prop]) {
                mappedRole[customKeys[prop]] = role[prop];
              }
            }
            return mappedRole;
          } else {
            return role;
          }
        })
        // clean up role.id
        .map(role => {
          role.id = clean(role.id);
          return role;
        })
        // map existing roles to base definition or pre-populate custom roles to ensure all properties
        .map(
          role =>
            rolesJSONbyId.get(role.id) ||
            state.roles.get(role.id) ||
            Object.assign({}, customRole, role)
        )
        // default empty icons and placeholders, clean up firstNight / otherNight
        .map(role => {
          if (rolesJSONbyId.get(role.id)) return role;
          role.imageAlt = // map team to generic icon
            {
              townsfolk: "good",
              outsider: "outsider",
              minion: "minion",
              demon: "evil",
              fabled: "fabled"
            }[role.team] || "custom";
          role.firstNight = Math.abs(role.firstNight);
          role.otherNight = Math.abs(role.otherNight);
          return role;
        })
        // filter out roles that don't match an existing role and also don't have name/ability/team
        .filter(role => role.name && role.ability && role.team)
        // sort by team
        .sort((a, b) => b.team.localeCompare(a.team));
      // convert to Map without Fabled
      state.roles = new Map(
        processedRoles
          .filter(role => role.team !== "fabled")
          .map(role => [role.id, role])
      );
      // update Fabled to include custom Fabled from this script
      state.fabled = new Map([
        ...processedRoles.filter(r => r.team === "fabled").map(r => [r.id, r]),
        ...fabledJSON.map(role => [role.id, role])
      ]);
      // update extraTravelers map to only show travelers not in this script
      state.otherTravelers = new Map(
        rolesJSON
          .filter(r => r.team === "traveler" && !roles.some(i => i.id === r.id))
          .map(role => [role.id, role])
      );
    },
    setSelectedEditions(state, selectedEditions){
      state.selectedEditions = {...selectedEditions};
      if (state.edition.id === "all") this.commit("setEdition", state.edition);
    },
    setStates(state, states){
      state.states = states;
    },
    setTeamsNames(state, names) {
      state.teamsNames = names;
    },
    setEdition(state, edition) {
      if (editionJSONbyId.has(edition.id)) {
        state.edition = editionJSONbyId.get(edition.id);
        state.roles = getRolesByEdition(state.edition);
        if (state.edition.id === 'all') { //只加载勾选了的剧本
          state.roles = new Map(
            Array.from(state.roles.entries()).filter((role) => {
              const value = role[1]; //value of the role
              return state.selectedEditions[value.edition];
            })
          )
        }
        // 为官方剧本增加原顺序选项
        if (state.session.isUseOldOrder) {
          if (edition.id === 'bmr') {
            state.roles.get('professor').otherNight = 81;
          }
          else if(edition.id === 'snv') {
            state.roles.get('pithag').otherNight = 35;
          }
        } else {
          // 复原顺序，map修改会修改内置数据库
          if (edition.id === 'bmr') {
            state.roles.get('professor').otherNight = 96;
          }
          else if(edition.id === 'snv') {
            state.roles.get('pithag').otherNight = 16;
          }
        }
        state.otherTravelers = getTravelersNotInEdition(state.edition);
      } else {
        state.edition = edition;
      }
      state.modals.edition = false;
    }
  },
  plugins: [persistence, socket]
});
