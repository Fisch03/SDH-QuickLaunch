import { ServerAPI } from "decky-frontend-lib";

import { App } from "./apptypes";

export const createShortcut = (name: string, launchOptions: string = "", target:string = "") => {
    return SteamClient.Apps.AddShortcut(name,"/usr/bin/ifyouseethisyoufoundabug", target, launchOptions); //The Part after the last Slash does not matter because it should always be replaced when launching an app
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
    if (result.success) {
        let appsDict = new Map<string, App>();
        for (let app of JSON.parse(result.result)) {
            if (app.name !== "" && !appsDict.has(app.name)) {
                appsDict.set(app.name, app);
            }
        }

        // map values to list
        apps = Array.from(appsDict.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    return apps
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
