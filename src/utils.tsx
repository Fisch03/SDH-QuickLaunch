import { ServerAPI } from "decky-frontend-lib";

import { App, getLaunchOptions, getTarget } from "./apptypes";

export const createShortcut = (name: string) => {
    //@ts-ignore
    let id:Promise<number> = SteamClient.Apps.AddShortcut(name,"/usr/bin/ifyouseethisyoufoundabug") //The Part after the last Slash does not matter because it should always be replaced when launching an app
    return id
}

export const gameIDFromAppID = (appid: number) => {
    //@ts-ignore
    let game = appStore.GetAppOverviewByAppID(appid);

    if(game !== null) {
        return game.m_gameid;
    } else {
        return -1
    }
}

export async function fetchApps(sAPI: ServerAPI, type: string): Promise<App[]> {
    const result = await sAPI.callPluginMethod<any, string>(`get_${type}`, {}); 
    let apps: App[] = []
    if(result.success) {
        apps = JSON.parse(result.result);
    }

    return apps
  }
  
export const launchApp = async (sAPI: ServerAPI, app: App) => {
    let id: number = await getShortcutID(sAPI);       
    
    //@ts-ignore
    SteamClient.Apps.SetShortcutLaunchOptions(id, getLaunchOptions(app))
    //@ts-ignore
    SteamClient.Apps.SetShortcutExe(id, `"${getTarget(app)}"`)

    setTimeout(() => {
        let gid = gameIDFromAppID(id);
        //@ts-ignore
        SteamClient.Apps.RunGame(gid,"",-1,100);
    }, 500)
  }

export const getShortcutID = async (sAPI: ServerAPI) => {
    const result = await sAPI.callPluginMethod<any, number>("get_id", {})

    if(result.success) {
        let id: number = result.result;

        if(id == -1) {
            id = await createShortcut("QuickLaunch");
            sAPI.callPluginMethod("set_id", {id: id});
        } else if(await gameIDFromAppID(id) == -1) {
            id = await createShortcut("QuickLaunch");
            sAPI.callPluginMethod("set_id", {id: id});
        }

        return id
    }
    
    return -1
}