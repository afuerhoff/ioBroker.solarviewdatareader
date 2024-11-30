"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var net = __toESM(require("net"));
class Solarviewdatareader extends utils.Adapter {
  tout;
  jobSchedule;
  chkCnt = 0;
  conn;
  lastCommand = null;
  constructor(options = {}) {
    super({
      ...options,
      name: "solarviewdatareader"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  // Nullen voranstellen - add Leading Zero
  aLZ(n) {
    return n <= 9 ? `0${n}` : n.toString();
  }
  calcChecksum(inputString) {
    const buffer = Buffer.from(inputString);
    let sum = 0;
    let index = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum = (sum + buffer[i]) % 128;
      if (buffer[i] === 125) {
        index = i + 2;
        break;
      }
    }
    const result = {
      result: buffer[index] === sum,
      chksum: sum,
      ind: index,
      data: buffer
    };
    return result;
  }
  async createObject(id, obj) {
    await this.setObjectNotExistsAsync(id, obj);
    await this.extendObject(id, obj);
    const currentState = await this.getStateAsync(id);
    const stCommon = obj.common;
    if (currentState === null && stCommon.def !== void 0) {
      await this.setState(id, stCommon.def, true);
    }
  }
  async createGlobalObjects() {
    const options = [
      [
        "info.connection",
        {
          type: "state",
          common: {
            name: "connection",
            type: "boolean",
            role: "indicator.connected",
            def: false,
            read: true,
            write: false,
            desc: "Solarview connection state",
            unit: ""
          },
          native: {}
        }
      ],
      [
        "info.lastUpdate",
        {
          type: "state",
          common: {
            name: "lastUpdate",
            type: "string",
            role: "date",
            def: (/* @__PURE__ */ new Date("1900-01-01T00:00:00")).toString(),
            read: true,
            write: false,
            desc: "Last connection date/time",
            unit: ""
          },
          native: {}
        }
      ]
    ];
    for (const option of options) {
      await this.createObject(...option);
    }
  }
  async createSolarviewObjects(device, additional = false) {
    let options = [
      [device, { type: "channel", common: { name: device }, native: {} }],
      [
        `${device}.current`,
        {
          type: "state",
          common: {
            name: "current",
            type: "number",
            role: "value.power",
            def: 0,
            read: true,
            write: false,
            desc: "Current PAC",
            unit: "W"
          },
          native: {}
        }
      ],
      [
        `${device}.daily`,
        {
          type: "state",
          common: {
            name: "daily",
            type: "number",
            role: "value.energy",
            def: 0,
            read: true,
            write: false,
            desc: "Daily yield",
            unit: "kWh"
          },
          native: {}
        }
      ],
      [
        `${device}.monthly`,
        {
          type: "state",
          common: {
            name: "monthly",
            type: "number",
            role: "value.energy",
            def: 0,
            read: true,
            write: false,
            desc: "Monthly yield",
            unit: "kWh"
          },
          native: {}
        }
      ],
      [
        `${device}.yearly`,
        {
          type: "state",
          common: {
            name: "yearly",
            type: "number",
            role: "value.energy",
            def: 0,
            read: true,
            write: false,
            desc: "Yearly yield",
            unit: "kWh"
          },
          native: {}
        }
      ],
      [
        `${device}.total`,
        {
          type: "state",
          common: {
            name: "total",
            type: "number",
            role: "value.energy",
            def: 0,
            read: true,
            write: false,
            desc: "Total yield",
            unit: "kWh"
          },
          native: {}
        }
      ]
    ];
    if (additional) {
      const additionalOptions = [
        [
          `${device}.udc`,
          {
            type: "state",
            common: {
              name: "udc",
              type: "number",
              role: "value.voltage",
              def: 0,
              read: true,
              write: false,
              desc: "Generator voltage",
              unit: "V"
            },
            native: {}
          }
        ],
        [
          `${device}.idc`,
          {
            type: "state",
            common: {
              name: "idc",
              type: "number",
              role: "value.current",
              def: 0,
              read: true,
              write: false,
              desc: "Generator current",
              unit: "A"
            },
            native: {}
          }
        ],
        [
          `${device}.udcb`,
          {
            type: "state",
            common: {
              name: "udcb",
              type: "number",
              role: "value.voltage",
              def: 0,
              read: true,
              write: false,
              desc: "Generator voltage",
              unit: "V"
            },
            native: {}
          }
        ],
        [
          `${device}.idcb`,
          {
            type: "state",
            common: {
              name: "idcb",
              type: "number",
              role: "value.current",
              def: 0,
              read: true,
              write: false,
              desc: "Generator current",
              unit: "A"
            },
            native: {}
          }
        ],
        [
          `${device}.udcc`,
          {
            type: "state",
            common: {
              name: "udcc",
              type: "number",
              role: "value.voltage",
              def: 0,
              read: true,
              write: false,
              desc: "Generator voltage",
              unit: "V"
            },
            native: {}
          }
        ],
        [
          `${device}.idcc`,
          {
            type: "state",
            common: {
              name: "idcc",
              type: "number",
              role: "value.current",
              def: 0,
              read: true,
              write: false,
              desc: "Generator current",
              unit: "A"
            },
            native: {}
          }
        ],
        [
          `${device}.udcd`,
          {
            type: "state",
            common: {
              name: "udcd",
              type: "number",
              role: "value.voltage",
              def: 0,
              read: true,
              write: false,
              desc: "Generator voltage",
              unit: "V"
            },
            native: {}
          }
        ],
        [
          `${device}.idcd`,
          {
            type: "state",
            common: {
              name: "idcd",
              type: "number",
              role: "value.current",
              def: 0,
              read: true,
              write: false,
              desc: "Generator current",
              unit: "A"
            },
            native: {}
          }
        ],
        [
          `${device}.ul1`,
          {
            type: "state",
            common: {
              name: "ul1",
              type: "number",
              role: "value.voltage",
              def: 0,
              read: true,
              write: false,
              desc: "Mains voltage",
              unit: "V"
            },
            native: {}
          }
        ],
        [
          `${device}.il1`,
          {
            type: "state",
            common: {
              name: "il1",
              type: "number",
              role: "value.current",
              def: 0,
              read: true,
              write: false,
              desc: "Mains current",
              unit: "A"
            },
            native: {}
          }
        ],
        [
          `${device}.ul2`,
          {
            type: "state",
            common: {
              name: "ul2",
              type: "number",
              role: "value.voltage",
              def: 0,
              read: true,
              write: false,
              desc: "Mains voltage",
              unit: "V"
            },
            native: {}
          }
        ],
        [
          `${device}.il2`,
          {
            type: "state",
            common: {
              name: "il2",
              type: "number",
              role: "value.current",
              def: 0,
              read: true,
              write: false,
              desc: "Mains current",
              unit: "A"
            },
            native: {}
          }
        ],
        [
          `${device}.ul3`,
          {
            type: "state",
            common: {
              name: "ul3",
              type: "number",
              role: "value.voltage",
              def: 0,
              read: true,
              write: false,
              desc: "Mains voltage",
              unit: "V"
            },
            native: {}
          }
        ],
        [
          `${device}.il3`,
          {
            type: "state",
            common: {
              name: "il3",
              type: "number",
              role: "value.current",
              def: 0,
              read: true,
              write: false,
              desc: "Mains current",
              unit: "A"
            },
            native: {}
          }
        ],
        [
          `${device}.tkk`,
          {
            type: "state",
            common: {
              name: "tkk",
              type: "number",
              role: "value.temperature",
              def: 0,
              read: true,
              write: false,
              desc: "Temperature",
              unit: "\xB0C"
            },
            native: {}
          }
        ]
      ];
      options = options.concat(additionalOptions);
    }
    for (const option of options) {
      await this.createObject(...option);
    }
  }
  async adjustIntervalToSeconds() {
    const adapterObj = await this.getForeignObjectAsync(
      `system.adapter.${this.namespace}`
    );
    if (!this.config.interval_seconds) {
      if (adapterObj) {
        adapterObj.native.interval_seconds = true;
        adapterObj.native.intervalVal *= 60;
        this.log.warn("Interval changed to seconds!");
        this.log.info("Interval attribute changed! Please check the configuration");
        this.log.info("Adapter restarts");
      }
    }
  }
  preprocessSolarviewData(response) {
    let sv_data = response.toString("ascii");
    sv_data = sv_data.replace(/[{}]+/g, "");
    return sv_data.split(",");
  }
  getSolarviewPrefix(dataCode) {
    const prefixMap = {
      "00": "pvig.",
      "01": "pvi1.",
      "02": "pvi2.",
      "03": "pvi3.",
      "04": "pvi4.",
      10: "scm0.",
      11: "scm1.",
      12: "scm2.",
      13: "scm3.",
      14: "scm4.",
      21: "d0supply.",
      22: "d0consumption."
    };
    return prefixMap[dataCode] || "";
  }
  processData = async (data) => {
    try {
      const strdata = this.preprocessSolarviewData(data);
      const id = this.getSolarviewPrefix(strdata[0]);
      const cs = this.calcChecksum(data.toString("ascii"));
      if (cs.result) {
        await this.handleChecksumSuccess(strdata, id, data);
      } else {
        this.handleChecksumFailure(strdata, cs);
      }
    } catch (error) {
      this.log.error(`processData: ${error}`);
    }
  };
  /*handleConnectionError(errorMessage: string): void {
      this.log.error(`handleConnectionError: ${errorMessage}`);
      this.setStateChanged('info.connection', { val: false, ack: true });
  }*/
  async handleChecksumSuccess(sv_data, sv_prefix, response) {
    try {
      this.chkCnt = 0;
      this.log.debug(`${response.toString("ascii")}`);
      await this.updateSolarviewStates(sv_data, sv_prefix);
      const sDate = `${sv_data[3]}-${this.aLZ(parseInt(sv_data[2]))}-${this.aLZ(parseInt(sv_data[1]))} ${this.aLZ(parseInt(sv_data[4]))}:${this.aLZ(parseInt(sv_data[5]))}`;
      this.setStateChanged("info.lastUpdate", { val: sDate, ack: true });
      this.setStateChanged("info.connection", { val: true, ack: true });
    } catch (error) {
      this.log.error(`handleChecksumSuccess: ${error}`);
    }
  }
  handleChecksumFailure(sv_data, csum) {
    if (csum.chksum !== 0) {
      if (csum.data.toString("ascii") != ";-)\n") {
        this.chkCnt += 1;
        this.log.warn(`checksum not correct! ${sv_data[0]}: ${csum.data.toString("ascii")}`);
      }
    }
  }
  async updateSolarviewStates(sv_data, sv_prefix) {
    try {
      this.updateState(`${sv_prefix}current`, sv_data, 10);
      if (sv_prefix === "pvig.") {
        await this.handleCCUUpdate(sv_data);
      }
      this.updateState(`${sv_prefix}daily`, sv_data, 6);
      this.updateState(`${sv_prefix}monthly`, sv_data, 7);
      this.updateState(`${sv_prefix}yearly`, sv_data, 8);
      this.updateState(`${sv_prefix}total`, sv_data, 9);
      if (sv_data.length >= 23) {
        this.updateExtendedStates(sv_data, sv_prefix);
      }
    } catch (error) {
      this.log.error(`updateSolarviewStates: ${error}`);
    }
  }
  async handleCCUUpdate(sv_data) {
    if (this.config.setCCU) {
      const obj = await this.findForeignObjectAsync(this.config.CCUSystemV, "state");
      if (obj && obj.name) {
        this.log.debug(`set CCU system variable: ${this.config.CCUSystemV}`);
        this.setForeignState(this.config.CCUSystemV, { val: Number(sv_data[10]), ack: false });
      } else {
        this.log.error(`CCU system variable ${this.config.CCUSystemV} does not exist!`);
      }
    }
  }
  updateExtendedStates(sv_data, sv_prefix) {
    this.updateState(`${sv_prefix}udc`, sv_data, 11);
    this.updateState(`${sv_prefix}idc`, sv_data, 12);
    this.updateState(`${sv_prefix}udcb`, sv_data, 13);
    this.updateState(`${sv_prefix}idcb`, sv_data, 14);
    this.updateState(`${sv_prefix}udcc`, sv_data, 15);
    this.updateState(`${sv_prefix}idcc`, sv_data, 16);
    this.updateState(`${sv_prefix}udcd`, sv_data, 17);
    this.updateState(`${sv_prefix}idcd`, sv_data, 18);
    if (sv_data.length === 27) {
      this.updateState(`${sv_prefix}ul1`, sv_data, 19);
      this.updateState(`${sv_prefix}il1`, sv_data, 20);
      this.updateState(`${sv_prefix}ul2`, sv_data, 21);
      this.updateState(`${sv_prefix}il2`, sv_data, 22);
      this.updateState(`${sv_prefix}ul3`, sv_data, 23);
      this.updateState(`${sv_prefix}il3`, sv_data, 24);
      this.updateState(`${sv_prefix}tkk`, sv_data, 25);
    } else if (sv_data.length === 23) {
      this.updateState(`${sv_prefix}ul1`, sv_data, 19);
      this.updateState(`${sv_prefix}il1`, sv_data, 20);
      this.updateState(`${sv_prefix}tkk`, sv_data, 21);
    }
  }
  updateState(stateName, sv_data, index) {
    const value = Number(sv_data[index]);
    this.setStateChanged(stateName, { val: value, ack: true });
  }
  async onReady() {
    try {
      const ip_address = this.config.ipaddress;
      const port = this.config.port;
      this.conn = new net.Socket();
      this.conn.setTimeout(2e3);
      const starttime = this.config.intervalstart.split(":").slice(0, 2).join(":");
      const endtime = this.config.intervalend.split(":").slice(0, 2).join(":");
      this.log.info(
        `start solarview ${ip_address}:${port} - polling interval: ${this.config.intervalVal}s (${starttime} to ${endtime})`
      );
      this.log.info(`d0 converter: ${this.config.d0converter.toString()}`);
      await this.createGlobalObjects();
      await this.createSolarviewObjects("pvig", false);
      if (this.config.d0converter) {
        await this.createSolarviewObjects("d0supply", false);
      }
      if (this.config.d0converter) {
        await this.createSolarviewObjects("d0consumption", false);
      }
      if (this.config.scm0) {
        await this.createSolarviewObjects("scm0", false);
      }
      if (this.config.scm1) {
        await this.createSolarviewObjects("scm1", false);
      }
      if (this.config.scm2) {
        await this.createSolarviewObjects("scm2", false);
      }
      if (this.config.scm3) {
        await this.createSolarviewObjects("scm3", false);
      }
      if (this.config.scm4) {
        await this.createSolarviewObjects("scm4", false);
      }
      if (this.config.pvi1) {
        await this.createSolarviewObjects("pvi1", true);
      }
      if (this.config.pvi2) {
        await this.createSolarviewObjects("pvi2", true);
      }
      if (this.config.pvi3) {
        await this.createSolarviewObjects("pvi3", true);
      }
      if (this.config.pvi4) {
        await this.createSolarviewObjects("pvi4", true);
      }
      this.conn.on("data", async (data) => {
        try {
          await this.processData(data);
        } catch (error) {
          this.log.error(`conn.on data: ${error}`);
        }
      });
      this.conn.on("close", async () => {
        try {
          if (this.lastCommand) {
            this.log.debug(`Connection closed after executing command: ${this.lastCommand}`);
          } else {
            this.log.debug("Connection closed");
          }
          if (this.chkCnt > 3) {
            await this.setState("info.connection", false, true);
            this.log.warn("Solarview Server is not reachable");
            this.chkCnt = 0;
          }
        } catch (error) {
          this.log.error(`conn.on close: ${error}`);
        }
      });
      this.conn.on("error", (err) => {
        this.log.error(`conn.on error - cmd: ${this.lastCommand} - ${err.message}`);
      });
      if (!this.config.interval_seconds) {
        await this.adjustIntervalToSeconds.call(this);
      }
      this.getData(port, ip_address);
      this.jobSchedule = setInterval(() => {
        try {
          this.getData(port, ip_address);
        } catch (error) {
          this.log.error(`onReady.getData: ${error}`);
        }
      }, this.config.intervalVal * 1e3);
    } catch (error) {
      this.log.error(`onReady: ${error}`);
    }
  }
  _sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
  getData(port, ip_address) {
    const { intervalstart, intervalend, d0converter, scm0, scm1, scm2, scm3, scm4, pvi1, pvi2, pvi3, pvi4 } = this.config;
    const starttime = intervalstart.split(":").slice(0, 2).join(":");
    let endtime = intervalend.split(":").slice(0, 2).join(":");
    endtime = endtime === "00:00" ? "23:59" : endtime;
    const dnow = /* @__PURE__ */ new Date();
    const dstart = /* @__PURE__ */ new Date(`${dnow.getFullYear()}-${dnow.getMonth() + 1}-${dnow.getDate()} ${starttime}`);
    const dend = /* @__PURE__ */ new Date(`${dnow.getFullYear()}-${dnow.getMonth() + 1}-${dnow.getDate()} ${endtime}`);
    let timeoutCnt = 0;
    const executeCommand = (cmd) => {
      try {
        timeoutCnt += 500;
        this.tout = setTimeout(() => {
          this.conn.connect(port, ip_address, () => {
            try {
              this.lastCommand = cmd;
              this.conn.write(cmd);
              this.conn.end();
            } catch (error) {
              this.log.error(`conn.connect: ${error}`);
            }
          });
        }, timeoutCnt);
      } catch (error) {
        this.log.error(`executeCommand: ${error}`);
      }
    };
    if (dnow >= dstart && dnow <= dend) {
      executeCommand("00*");
      if (d0converter) {
        executeCommand("21*");
      }
      if (pvi1) {
        executeCommand("01*");
      }
      if (pvi2) {
        executeCommand("02*");
      }
      if (pvi3) {
        executeCommand("03*");
      }
      if (pvi4) {
        executeCommand("04*");
      }
    }
    if (d0converter) {
      executeCommand("22*");
    }
    if (scm0) {
      executeCommand("10*");
    }
    if (scm1) {
      executeCommand("11*");
    }
    if (scm2) {
      executeCommand("12*");
    }
    if (scm3) {
      executeCommand("13*");
    }
    if (scm4) {
      executeCommand("14*");
    }
  }
  onUnload(callback) {
    try {
      clearInterval(this.jobSchedule);
      clearTimeout(this.tout);
      this.conn.destroy();
      this.setStateChanged("info.connection", { val: false, ack: true });
      this.log.info("cleaned everything up...");
      callback();
    } catch (error) {
      this.log.info(`onUnload: ${error}`);
      callback();
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new Solarviewdatareader(options);
} else {
  (() => new Solarviewdatareader())();
}
//# sourceMappingURL=main.js.map
