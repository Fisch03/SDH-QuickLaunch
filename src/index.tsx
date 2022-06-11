import {
  definePlugin,
  ServerAPI,
  staticClasses,
  Dropdown,
  DropdownOption,
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  Toggle
} from "decky-frontend-lib";
import { Fragment, useEffect } from "react";
import { VFC, useState } from "react";
import { FaRocket } from "react-icons/fa";

import { App } from "./apptypes";
import { Settings } from "./settings";
import { GridDBPanel, getImagesForGame } from "./steamgriddb";
import { fetchApps, launchApp, createShortcut, setLaunchOptions } from "./utils";

let appList: App[] = [];

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<number | null>(null);

  const [settings] = useState<Settings>(new Settings(serverAPI))

  const [buttonText, setButtonText] = useState<string>();
  const updateButtonText = () => settings.get("createNewShortcut")? setButtonText("Create!") : setButtonText("Launch!");

  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);

  useEffect(() => {
    fetchApps(serverAPI).then(list => {
      appList = list;
      setDropdownOptions(list.map((a, i) => {return { data: i, label: a.name }}));
    });

    settings.readSettings().then(() => {
      updateButtonText();
      setShowKeyInput(settings.get("useGridDB"));
      //setKeyInputValue(settings.get("gridDBKey"));
    });
  }, []);

  function doButtonAction() {
    if(selectedApp === null) return;

    let app = appList[selectedApp];
    if(settings.get("createNewShortcut")) {
      createShortcut(app.name).then((id:number) => {
        if(settings.get("useGridDB")) {
          getImagesForGame(serverAPI, settings.get("gridDBKey"),app.name).then(images => {
            //@ts-ignore
            if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Grid, "png", 0);
            //@ts-ignore
            if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Hero, "png", 1);
            //@ts-ignore
            if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Logo, "png", 2);
            //@ts-ignore
            //if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.GridH, "png", 3);
          })
        }

        setTimeout(() => {
          setLaunchOptions(id, app);
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
