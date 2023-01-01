import {
  definePlugin,
  ServerAPI,
  staticClasses,
  Dropdown,
  MultiDropdownOption,
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  Toggle,
  showModal,
  ModalRoot,
  DropdownOption
} from "decky-frontend-lib";
import { Fragment, useEffect } from "react";
import { VFC, useState } from "react";
import { FaRocket } from "react-icons/fa";

import { App, getLaunchOptions, getTarget } from "./apptypes";
import { Settings } from "./settings";
import { GridDBPanel, getImagesForGame } from "./steamgriddb";
import { fetchApps, launchApp, createShortcut } from "./utils";

let appList: App[] = [];

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [dropdownOptions, setDropdownOptions] = useState<MultiDropdownOption[] | DropdownOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<number | null>(null);

  const [settings] = useState<Settings>(new Settings(serverAPI))

  const [buttonText, setButtonText] = useState<string>();
  const updateButtonText = () => settings.get("createNewShortcut")? setButtonText("Create!") : setButtonText("Launch!");

  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);

  useEffect(() => {
    buildAppList();

    settings.readSettings().then(() => {
      updateButtonText();
      setShowKeyInput(settings.get("useGridDB"));
      //setKeyInputValue(settings.get("gridDBKey"));
    });
  }, []);

  function buildAppList() {
    if(settings.get("enableAll")) {
      let newDropdownOptions: MultiDropdownOption[] = [];

      fetchApps(serverAPI, "flatpaks")
      .then(list => {
        newDropdownOptions.push(createSubcategory("Flatpaks", list));
        return fetchApps(serverAPI, "desktops");
      })
      .then(list => {
        newDropdownOptions.push(createSubcategory(".desktop files", list));
        setDropdownOptions(newDropdownOptions);
      });
    } else {
      fetchApps(serverAPI, "flatpaks")
      .then(list => {
        setDropdownOptions(createSubcategory("Flatpaks", list).options)
        appList = list
      })
    }
  }

  function createSubcategory(categoryName: string, list: App[]) {
    appList = appList.concat(list);

    return {
      label: categoryName,
      options: list.map((a, i) => {return { data: i + appList.length- list.length, label: a.name }})
    }
    
  }

  function doButtonAction() {
    if(selectedApp === null) return;

    let app = appList[selectedApp];
    if(settings.get("createNewShortcut")) {
      createShortcut(app.name).then((id:number) => {
        if(settings.get("useGridDB")) {
          getImagesForGame(serverAPI, settings.get("gridDBKey"),app.name)
          .then(images => {
            //@ts-ignore
            if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Grid, "png", 0);
            //@ts-ignore
            if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Hero, "png", 1);
            //@ts-ignore
            if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Logo, "png", 2);
            //@ts-ignore
            //if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.GridH, "png", 3);
          })
          .catch(() => {}); //Maybe display error to the user in the future?
        }

        setTimeout(() => {
          //@ts-ignore
          SteamClient.Apps.SetShortcutLaunchOptions(id, getLaunchOptions(app));
          //@ts-ignore
          SteamClient.Apps.SetShortcutExe(id, `"${getTarget(app)}"`);
        }, 500)
      })
    } else {
      launchApp(serverAPI, app);
    }
  }

  return (
    <Fragment>
      <PanelSection>
        <PanelSectionRow>
          <Dropdown
            strDefaultLabel="Select App..."
            rgOptions={dropdownOptions}
            selectedOption={selectedApp}
            onChange={(data) => setSelectedApp(data.data)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => doButtonAction()}>
            {buttonText}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title="Settings">
        <PanelSectionRow>
          <Toggle
            label="Add as a separate Shortcut"
            checked={settings.get("createNewShortcut")}
            onChange={(e) => {settings.set("createNewShortcut", e); updateButtonText()}}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <Toggle
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
          <Toggle
            label="Enable Launching all Apps"
            checked={settings.get("enableAll")}
            onChange={(e) => {
              
              if(e) {
                showModal(
                  <ModalRoot
                    bAllowFullSize={true}
                  >
                    Warning: Launching some Applications will temporarily break the ability to start <b>any</b> Shortcut from the Steam Deck UI.<br />
                    If that happens hold down the Power Button and hit "Restart Steam Client". This is a bug within the Steam Deck and unfortunately cannot be circumvented on my side.<br />
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
  };
});
