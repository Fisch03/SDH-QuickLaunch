import {
  definePlugin,
  ServerAPI,
  staticClasses,
  Dropdown,
  MultiDropdownOption,
  PanelSection,
  PanelSectionRow,
  ToggleField,
  showModal,
  ModalRoot,
  SingleDropdownOption,
  DropdownOption,
  DialogButton,
  Focusable,
  FileSelectionType
} from "decky-frontend-lib";
import { Fragment, useEffect } from "react";
import { VFC, useState } from "react";
import { FaRocket, FaStar, FaRegStar } from "react-icons/fa";

import { App, getLaunchOptions, getTarget } from "./apptypes";
import { Settings } from "./settings";
import { GridDBPanel, getImagesForGame } from "./steamgriddb";
import { fetchApps, launchApp, createShortcut } from "./utils";
import { ShortcutOptionsModal } from "./shortcutoptions";

let appList: App[] = [];

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<number | null>(null);

  const [settings] = useState<Settings>(new Settings(serverAPI))

  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);

  const [isStarred, setIsStarred] = useState<boolean>(false);

  useEffect(() => {
    settings.readSettings().then(() => {
      if(dropdownOptions.length === 0 || appList.length === 0) 
        buildAppList();
      setShowKeyInput(settings.get("useGridDB"));
    });
  }, []);

  function buildAppList() {
    return new Promise<void>((resolve) => {
      let newDropdownOptions: DropdownOption[] = [];
      appList = [];

      let starredApps = settings.get("starredApps");

      if(starredApps.length > 0)
        newDropdownOptions.push(...createSubcategory("Starred Apps", settings.get("starredApps")).options);

      fetchApps(serverAPI, "flatpaks")
      .then(list => {
        list = list.filter(app => {
          for(let starredApp of starredApps) {
            if(starredApp.name === app.name) return false;
          }
          return true;
        });

        newDropdownOptions.push(createSubcategory("Flatpaks", list));
        if(settings.get("enableAll")) {
          return fetchApps(serverAPI, "desktops")
        } else {
          return Promise.resolve([]);
        }
      })
      .then(list => {
        if(list.length > 0) {
          list = list.filter(app => {
            for(let starredApp of starredApps) {
              if(starredApp.name === app.name) return false;
            }
            return true;
          });
          newDropdownOptions.push(createSubcategory(".desktop files", list));
        }
      })
      .finally(() => {
        setDropdownOptions(newDropdownOptions);
        resolve();
      })
    })
  }

  function createSubcategory(categoryName: string, list: App[]) {
    appList = appList.concat(list);

    return {
      label: categoryName,
      options: list.map((a, i) => {return { data: i + appList.length- list.length, label: a.name } as SingleDropdownOption})
    } as MultiDropdownOption;
    
  }

  function createAppShortcut(app: App, launchOptions?: string, target?:string, compatTool?: string) {
    let shortcutLaunchOptions = launchOptions === undefined ? getLaunchOptions(app) : launchOptions
    let shortcutTarget = target === undefined ? getTarget(app) : target
    createShortcut(app.name, shortcutLaunchOptions, shortcutTarget).then((id:number) => {
      if(settings.get("useGridDB")) {
        getImagesForGame(serverAPI, settings.get("gridDBKey"),app.name)
        .then(images => {
          if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Grid, "png", 0);
          if(images.Hero !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Hero, "png", 1);
          if(images.Logo !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Logo, "png", 2);
          //if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.GridH, "png", 3);
        })
        .catch(() => {}); //Maybe display error to the user in the future?
      }

      //This should teoretically not be needed with the new SteamClient.Apps.AddShortcut params but they seem to be pretty broken rn. It's not like it hurts either.
      setTimeout(() => {
        SteamClient.Apps.SetShortcutName(id, app.name);
        SteamClient.Apps.SetShortcutLaunchOptions(id, getLaunchOptions(app));
        SteamClient.Apps.SetShortcutExe(id, `"${getTarget(app)}"`);
        if (compatTool != null) SteamClient.Apps.SpecifyCompatTool(id, compatTool);
      }, 500)
    })
  }

  async function createFileShortcut() {
    let lastUsedPath = localStorage.getItem('decky-addtosteam')
    let deckyUserHome = (await serverAPI.callPluginMethod('get_DECKY_USER_HOME', {})).result
    let path: string
    if (lastUsedPath != null) {
      path = lastUsedPath
    } else if (typeof deckyUserHome === 'string') {
      path = deckyUserHome
    } else {
      return
    }
    let filepath = await serverAPI.openFilePickerV2(
      FileSelectionType.FILE,
      path,
      true,
      undefined,
      undefined,
      undefined,
      false,
      true
    )
    if (!filepath) { return }

    showModal(<ShortcutOptionsModal createAppShortcut={createAppShortcut} filepath={filepath} serverAPI={serverAPI}/>)
  }

  function newShortcut() {
    if(selectedApp != null){
      createAppShortcut(appList[selectedApp])
    } else if (selectedApp === null && settings.get("enableAll")) {
      createFileShortcut()
    } else { return; }
  }

  return (
    <Fragment>
      <PanelSection>
        <PanelSectionRow>
          <Focusable flow-children="horizontal" style={{display: "flex", justifyContent: "space-between", padding: 0, gap: "8px"}}>
            <div style={{flexGrow: 1}}>
              <Dropdown
                strDefaultLabel="Select App..."
                rgOptions={dropdownOptions}
                selectedOption={selectedApp}
                onChange={(e: SingleDropdownOption) => {
                  setIsStarred(e.data < settings.get("starredApps").length);
                  setSelectedApp(e.data);
                }}
              />
            </div>
            
            <DialogButton style={{minWidth: 0, width: "15%", padding: 0}} onClick={() => {
                if(selectedApp === null) return;

                let toBeStarred = appList[selectedApp];

                setIsStarred(!isStarred);
                let starredApps = settings.get("starredApps");
                if(isStarred) {
                  starredApps.splice(starredApps.indexOf(appList[selectedApp]), 1);
                } else {
                  starredApps.push(appList[selectedApp]);
                }
                settings.set("starredApps", starredApps);

                buildAppList()
                .then(() => {
                  if(isStarred) {
                    let foundApp = 0;
                    for(let app of appList) {
                      if(app.name === toBeStarred.name) {
                        foundApp = appList.indexOf(app);
                        break;
                      }
                    }

                    setSelectedApp(foundApp);
                  } else {
                    setSelectedApp(starredApps.length-1);
                  }
                })
              }}>
              {isStarred ? <FaStar /> : <FaRegStar />}
            </DialogButton>
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <DialogButton style={{ marginTop: "8px" }} onClick={() => {
            if(selectedApp === null) return;
            launchApp(serverAPI, appList[selectedApp])
          }}>
            Launch!
          </DialogButton>
        </PanelSectionRow>
        <PanelSectionRow>
          <DialogButton style={{ marginTop: "8px" }} onClick={() => {newShortcut()}}>
            Create Shortcut
          </DialogButton>
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title="Settings">
        <PanelSectionRow>
          <ToggleField
            label="Automatically download Artworks from SteamGridDB"
            checked={settings.get("useGridDB")}
            onChange={(e) => {settings.set("useGridDB", e); setShowKeyInput(e)}}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <GridDBPanel 
            enabled={showKeyInput}
            key={settings.get("gridDBKey")}
            updateKey={(key) => {settings.set("gridDBKey", key)}}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Enable Launching all Apps"
            checked={settings.get("enableAll")}
            onChange={(e) => {
              
              if(e) {
                showModal(
                  <ModalRoot
                    bAllowFullSize={true}
                  >
                    Warning: Launching some Applications will temporarily break the ability to start any Shortcut from the Steam Deck UI.<br />
                    If that happens hold down the Power Button and hit "Restart Steam". This is a bug within the Steam Deck and unfortunately cannot be circumvented on my side.<br />
                    <br />
                    By continuing, you acknowledge to have read this Warning. Thanks for reading and have fun!
                  </ModalRoot>
                )
              }
              settings.set("enableAll", e)
              buildAppList();
            }}
          />
        </PanelSectionRow>
      </PanelSection>
    </Fragment>
  );
};

export default definePlugin((serverApi: ServerAPI) => {
  return {
    title: <div className={staticClasses.Title}>SDH-QuickLaunch</div>,
    content: <Content serverAPI={serverApi} />,
    icon: <FaRocket />,
    alwaysRender: true,
  };
});
