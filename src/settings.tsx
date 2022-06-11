import { ServerAPI } from "decky-frontend-lib";

export class Settings {
  sAPI: ServerAPI;

  //@ts-ignore
  private createNewShortcut: boolean = false;
  //@ts-ignore
  private useGridDB: boolean = false;
  //@ts-ignore
  private gridDBKey: string = "";

  constructor(sAPI: ServerAPI, startingSettings: Settings = {} as Settings) {
    this.sAPI = sAPI;

    this.setMultiple(startingSettings);
  }

  set(key: string, value: any) {
    if(this.hasOwnProperty(key)) {
      this[key] = value;
      this.writeChange(key, value);
    }
    return this
  }

  setMultiple(settings: Settings) {
    Object.keys(settings).forEach(key => {
      this.set(key, settings[key]);
    })
    return this
  }

  get(key: string): any {
    return this[key];
  }

  readSettings(): Promise<Settings> {
    return new Promise<Settings>((resolve, reject) => {
      this.sAPI.callPluginMethod<any, Settings>("get_config", {}).then(result => {
        if(result.success) {
          this.setMultiple(result.result);
          resolve(this);
        } else {
          reject();
        }
      });
    });
  }

  writeChange(key: string, value: any) {
    this.sAPI.callPluginMethod<any, Settings>("set_config_value", {key: key, value: value});
  }
}
