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
const sv_cmd = "00*";
let conn;
let jobSchedule;
let tout;
class Solarviewdatareader extends utils.Adapter {
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
    return n <= 9 ? "0" + n : n.toString();
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
      "result": buffer[index] === sum,
      "chksum": sum,
      "ind": index,
      "data": buffer
    };
    return result;
  }
  //async createObject(that: Solarviewdatareader, id: string, typeVal: ioBroker.CommonType, name: string, commonType: string, role: string, def: any, rd: boolean, wr: boolean, desc: string, unit: string) {
  async createObject(id, obj) {
    await this.setObjectNotExistsAsync(id, obj);
    const currentState = await this.getStateAsync(id);
    const stCommon = obj.common;
    if (currentState === null && stCommon.def !== void 0) {
      this.setState(id, stCommon.def, true);
    }
  }
  async createGlobalObjects() {
    const options = [
      ["info.connection", { type: "state", common: { name: "connection", type: "boolean", role: "indicator.connected", def: false, read: true, write: false, desc: "Solarview connection state", unit: "" }, native: {} }],
      ["info.lastUpdate", { type: "state", common: { name: "lastUpdate", type: "string", role: "date", def: (/* @__PURE__ */ new Date("1900-01-01T00:00:00")).toString(), read: true, write: false, desc: "Last connection date/time", unit: "" }, native: {} }]
      //['info.connection', 'state', 'connection', 'boolean', 'indicator.connected', false, true, false, 'Solarview connection state', ''],
      //['info.lastUpdate', 'state', 'lastUpdate', 'string', 'date', (new Date('1900-01-01T00:00:00')).toString(), true, false, 'Last connection date/time', ''],
    ];
    for (const option of options) {
      await this.createObject(...option);
    }
  }
  async createSolarviewObjects(device, additional = false) {
    let options = [
      [device + ".current", { type: "state", common: { name: "current", type: "number", role: "value", def: 0, read: true, write: false, desc: "Current PAC", unit: "W" }, native: {} }],
      [device + ".daily", { type: "state", common: { name: "daily", type: "number", role: "value", def: 0, read: true, write: false, desc: "Daily yield", unit: "kWh" }, native: {} }],
      [device + ".monthly", { type: "state", common: { name: "monthly", type: "number", role: "value", def: 0, read: true, write: false, desc: "Monthly yield", unit: "kWh" }, native: {} }],
      [device + ".yearly", { type: "state", common: { name: "yearly", type: "number", role: "value", def: 0, read: true, write: false, desc: "Yearly yield", unit: "kWh" }, native: {} }],
      [device + ".total", { type: "state", common: { name: "total", type: "number", role: "value", def: 0, read: true, write: false, desc: "Total yield", unit: "kWh" }, native: {} }]
    ];
    if (additional) {
      const additionalOptions = [
        [device + ".udc", { type: "state", common: { name: "udc", type: "number", role: "value", def: 0, read: true, write: false, desc: "Generator voltage", unit: "V" }, native: {} }],
        [device + ".idc", { type: "state", common: { name: "idc", type: "number", role: "value", def: 0, read: true, write: false, desc: "Generator current", unit: "A" }, native: {} }],
        [device + ".udcb", { type: "state", common: { name: "udcb", type: "number", role: "value", def: 0, read: true, write: false, desc: "Generator voltage", unit: "V" }, native: {} }],
        [device + ".idcb", { type: "state", common: { name: "idcb", type: "number", role: "value", def: 0, read: true, write: false, desc: "Generator current", unit: "A" }, native: {} }],
        [device + ".udcc", { type: "state", common: { name: "udcc", type: "number", role: "value", def: 0, read: true, write: false, desc: "Generator voltage", unit: "V" }, native: {} }],
        [device + ".idcc", { type: "state", common: { name: "idcc", type: "number", role: "value", def: 0, read: true, write: false, desc: "Generator current", unit: "A" }, native: {} }],
        [device + ".udcd", { type: "state", common: { name: "udcd", type: "number", role: "value", def: 0, read: true, write: false, desc: "Generator voltage", unit: "V" }, native: {} }],
        [device + ".idcd", { type: "state", common: { name: "idcd", type: "number", role: "value", def: 0, read: true, write: false, desc: "Generator current", unit: "A" }, native: {} }],
        [device + ".ul1", { type: "state", common: { name: "ul1", type: "number", role: "value", def: 0, read: true, write: false, desc: "Mains voltage", unit: "V" }, native: {} }],
        [device + ".il1", { type: "state", common: { name: "il1", type: "number", role: "value", def: 0, read: true, write: false, desc: "Mains current", unit: "A" }, native: {} }],
        [device + ".ul2", { type: "state", common: { name: "ul2", type: "number", role: "value", def: 0, read: true, write: false, desc: "Mains voltage", unit: "V" }, native: {} }],
        [device + ".il2", { type: "state", common: { name: "il2", type: "number", role: "value", def: 0, read: true, write: false, desc: "Mains current", unit: "A" }, native: {} }],
        [device + ".ul3", { type: "state", common: { name: "ul3", type: "number", role: "value", def: 0, read: true, write: false, desc: "Mains voltage", unit: "V" }, native: {} }],
        [device + ".il3", { type: "state", common: { name: "il3", type: "number", role: "value", def: 0, read: true, write: false, desc: "Mains current", unit: "A" }, native: {} }],
        [device + ".tkk", { type: "state", common: { name: "tkk", type: "number", role: "value", def: 0, read: true, write: false, desc: "Temperature", unit: "\xB0C" }, native: {} }]
      ];
      options = options.concat(additionalOptions);
    }
    for (const option of options) {
      await this.createObject(...option);
    }
  }
  async adjustIntervalToSeconds() {
    const adapterObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
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
  async getData(port, ip_address) {
    const { intervalstart, intervalend, d0converter, scm0, scm1, scm2, scm3, scm4, pvi1, pvi2, pvi3, pvi4 } = this.config;
    const starttime = intervalstart.split(":").slice(0, 2).join(":");
    let endtime = intervalend.split(":").slice(0, 2).join(":");
    endtime = endtime === "00:00" ? "23:59" : endtime;
    const dnow = /* @__PURE__ */ new Date();
    const dstart = /* @__PURE__ */ new Date(`${dnow.getFullYear()}-${dnow.getMonth() + 1}-${dnow.getDate()} ${starttime}`);
    const dend = /* @__PURE__ */ new Date(`${dnow.getFullYear()}-${dnow.getMonth() + 1}-${dnow.getDate()} ${endtime}`);
    let timeoutCnt = 0;
    const executeCommand = (cmd) => {
      timeoutCnt += 500;
      tout = setTimeout(() => {
        conn.connect(port, ip_address, () => {
          conn.write(cmd);
          conn.end();
        });
      }, timeoutCnt);
    };
    if (dnow >= dstart && dnow <= dend) {
      executeCommand("00*");
      if (d0converter)
        executeCommand("21*");
      if (pvi1)
        executeCommand("01*");
      if (pvi2)
        executeCommand("02*");
      if (pvi3)
        executeCommand("03*");
      if (pvi4)
        executeCommand("04*");
    }
    if (d0converter)
      executeCommand("22*");
    if (scm0)
      executeCommand("10*");
    if (scm1)
      executeCommand("11*");
    if (scm2)
      executeCommand("12*");
    if (scm3)
      executeCommand("13*");
    if (scm4)
      executeCommand("14*");
  }
  async onReady() {
    const ip_address = this.config.ipaddress;
    const port = this.config.port;
    let chkCnt = 0;
    const that = this;
    conn = new net.Socket();
    conn.setTimeout(2e3);
    await this.createGlobalObjects();
    if (this.config.d0converter)
      await this.createSolarviewObjects("d0", false);
    if (this.config.scm0)
      await this.createSolarviewObjects("scm0", false);
    if (this.config.scm1)
      await this.createSolarviewObjects("scm1", false);
    if (this.config.scm2)
      await this.createSolarviewObjects("scm2", false);
    if (this.config.scm3)
      await this.createSolarviewObjects("scm3", false);
    if (this.config.scm4)
      await this.createSolarviewObjects("scm4", false);
    if (this.config.pvi1)
      await this.createSolarviewObjects("pvi1", true);
    if (this.config.pvi2)
      await this.createSolarviewObjects("pvi2", true);
    if (this.config.pvi3)
      await this.createSolarviewObjects("pvi3", true);
    if (this.config.pvi4)
      await this.createSolarviewObjects("pvi4", true);
    const processData = async (data) => {
      let strdata = data.toString();
      let id;
      let pv;
      let cs;
      let sdata;
      switch (true) {
        case strdata.startsWith("/"):
          id = strdata.substring(1, 4);
          pv = strdata.substring(5, strdata.length - 4);
          cs = this.calcChecksum(strdata);
          if (cs.result) {
            that.setState(id, pv, true);
          }
          break;
        case strdata.startsWith(":"):
          sdata = strdata.substring(1, strdata.length - 2).split(",");
          that.setState("total", Number(sdata[3]) * 1e3, true);
          break;
        default:
          that.log.warn(`Data cannot be processed: ${strdata}`);
          break;
      }
    };
    conn.on("data", async (data) => {
      chkCnt = 0;
      clearTimeout(jobSchedule);
      jobSchedule = setTimeout(() => {
        this.getData(port, ip_address);
      }, this.config.intervalVal * 1e3);
      await processData(data);
    });
    conn.on("close", () => {
      if (chkCnt > 3) {
        this.setState("info.connection", false, true);
        this.log.warn("Solarview Server is not reachable");
        chkCnt = 0;
      }
      chkCnt++;
      clearTimeout(jobSchedule);
      jobSchedule = setTimeout(() => {
        this.getData(port, ip_address);
      }, 1e4);
    });
    conn.on("error", (err) => {
      this.log.error(err.message);
    });
    if (this.config.interval_seconds) {
      this.config.intervalVal = this.config.intervalVal / 60;
    } else {
      await this.adjustIntervalToSeconds.call(this);
    }
    jobSchedule = setTimeout(() => {
      this.getData(port, ip_address);
    }, 1e3);
  }
  async onUnload(callback) {
    try {
      clearTimeout(jobSchedule);
      clearTimeout(tout);
      conn.destroy();
      this.log.info("cleaned everything up...");
      callback();
    } catch (e) {
      callback();
    }
  }
}
if (module.parent) {
  module.exports = (options) => new Solarviewdatareader(options);
} else {
  (() => new Solarviewdatareader())();
}
//# sourceMappingURL=main.js.map
