import { ServerAPI } from "decky-frontend-lib";

import { App, FlatpakApp, isFlatpak } from "./apptypes";

export const createShortcut = (name: string) => {
    //@ts-ignore
    let id:number = SteamClient.Apps.AddShortcut(name,"/usr/bin/flatpak")
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

export const fetchApps = async (sAPI: ServerAPI): Promise<App[]> => {
    const result = await sAPI.callPluginMethod<any, any>("get_flatpaks", {} as any); 
    let flatpaks: FlatpakApp[] = []
    if(result.success) {
        flatpaks = JSON.parse(result.result);
    }

    return [...flatpaks] as App[]
  }
  
export const launchApp = async (sAPI: ServerAPI, app: App) => {
    let id: number = await getShortcutID(sAPI);       
    let launchOptions: string = ""      
  
    if(isFlatpak(app)) {
       launchOptions = `run ${app.package}`
    }

    //@ts-ignore
    SteamClient.Apps.SetShortcutLaunchOptions(id, launchOptions); //This does not apply immediately and also cannot be awaited!
    setTimeout(async () => {
        let gid = await gameIDFromAppID(id);
        //@ts-ignore
        SteamClient.Apps.RunGame(gid,"",-1,100);
    }, 500)
  }

export const getShortcutID = async (sAPI: ServerAPI) => {
    const result = await sAPI.callPluginMethod<any, number>("get_id", {} as any)

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