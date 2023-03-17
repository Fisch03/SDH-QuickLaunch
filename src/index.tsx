import {
  definePlugin,
  ServerAPI,
  staticClasses,
  Dropdown,
  MultiDropdownOption,
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  ToggleField,
  showModal,
  ModalRoot,
  SingleDropdownOption,
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
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<number | null>(null);

  const [settings] = useState<Settings>(new Settings(serverAPI))

  const [buttonText, setButtonText] = useState<string>("Launch!");
  const updateButtonText = () => settings.get("createNewShortcut")? setButtonText("Create!") : setButtonText("Launch!");

  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);

  useEffect(() => {
    settings.readSettings().then(() => {
      if(dropdownOptions.length === 0 || appList.length === 0) 
        buildAppList();
      updateButtonText();
      setShowKeyInput(settings.get("useGridDB"));
      //setKeyInputValue(settings.get("gridDBKey"));
    });
  }, []);

  function buildAppList() {
      appList = [];
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
      options: list.map((a, i) => {return { data: i + appList.length- list.length, label: a.name } as SingleDropdownOption})
    } as MultiDropdownOption;
    
  }

  function doButtonAction() {
    if(selectedApp === null) return;

    let app = appList[selectedApp];
    if(settings.get("createNewShortcut")) {
      createShortcut(app.name).then((id:number) => {
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

        setTimeout(() => {
          SteamClient.Apps.SetShortcutLaunchOptions(id, getLaunchOptions(app));
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
            onChange={(e: SingleDropdownOption) => {setSelectedApp(e.data);}}
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
          <ToggleField
            label="Add as a separate Shortcut"
            checked={settings.get("createNewShortcut")}
            onChange={(e) => {settings.set("createNewShortcut", e); updateButtonText()}}
          />
        </PanelSectionRow>
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
