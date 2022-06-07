import { ServerAPI } from "decky-frontend-lib";

export const sc   = async (sAPI: ServerAPI, action: string) => sAPI.executeInTab("SP", true, `SteamClient.${action}`);
export const apps = async (sAPI: ServerAPI, action: string) => sAPI.executeInTab("SP", true,        `Apps.${action}`);

export const createShortcut = async (sAPI: ServerAPI, name: string) => {
    let result:any = await sc(sAPI, `Apps.AddShortcut("${name}","/usr/bin/flatpak")`)
    let id:number = result.result.result;
    return id
}

export const gameIDFromAppID = async (sAPI:ServerAPI, appid: number) => {
    //executing most of js in the tab avoids some errors i cannot explain myself
    let result:any = await sAPI.executeInTab("SP", true, `
        (async () => {
            let res = await appStore.GetAppOverviewByAppID(${appid})
            return JSON.stringify(res)
        })();
    `)
    
    let game = result.result.result; //yes

    if(game != "null") {
        game = JSON.parse(game);
        return game.m_gameid;
    } else {
        return -1
    }
}

export const fetchApps = async (sAPI: ServerAPI) => {
    const result = await sAPI.callPluginMethod<any, any>("get_flatpaks", {} as any); 
    if(result.success) {
      return JSON.parse(result.result);
    }
  }
  
export const launchApp = async (sAPI: ServerAPI, packageName: string) => {
    let id: number = await getShortcutID(sAPI);             
  
    sc(sAPI, `Apps.SetShortcutLaunchOptions(${id}, "run ${packageName}")`); //This does not apply immediately and also cannot be awaited!
    setTimeout(async () => {
        let gid = await gameIDFromAppID(sAPI, id);
        sc(sAPI, `Apps.RunGame("${gid}","",-1,100)`);
    }, 100)
  }

export const getShortcutID = async (sAPI: ServerAPI) => {
    const result = await sAPI.callPluginMethod<any, number>("get_id", {} as any)

    if(result.success) {
        let id: number = result.result;

        if(id == -1) {
            id = await createShortcut(sAPI, "QuickLaunch");
            sAPI.callPluginMethod("set_id", {id: id});
        } else if(await gameIDFromAppID(sAPI, id) == -1) {
            id = await createShortcut(sAPI, "QuickLaunch");
            sAPI.callPluginMethod("set_id", {id: id});
        }

        return id
    }
    
    return -1
}