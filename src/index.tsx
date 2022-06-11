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
import { Fragment, useLayoutEffect } from "react";
import { VFC, useState } from "react";
import { FaRocket } from "react-icons/fa";

import { App } from "./apptypes";
import { Settings } from "./settings";
import { GridDBPanel } from "./steamgriddb";
import { fetchApps, launchApp, createShortcut, setLaunchOptions } from "./utils";

let appList: App[] = [];

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<number | null>(null);

  const [settings] = useState<Settings>(new Settings(serverAPI))

  const [buttonText, setButtonText] = useState<string>();
  const updateButtonText = () => settings.get("createNewShortcut")? setButtonText("Create!") : setButtonText("Launch!");

  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const [initialKeyValue, setInitialKeyValue] = useState<string>("");

  useLayoutEffect(() => {
    fetchApps(serverAPI).then(appList => {
      setDropdownOptions(appList.map((a, i) => {return { data: i, label: a.name }}));
    });

    settings.readSettings().then(() => {
      updateButtonText();
      setShowKeyInput(settings.get("useGridDB"));
      setInitialKeyValue(settings.get("gridDBKey"));
    });
  }, []);

  function doButtonAction() {
    if(selectedApp === null) return;

    let app = appList[selectedApp];
    if(settings.get("createNewShortcut")) {
      createShortcut(app.name).then((id:number) => setLaunchOptions(id, app))
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
            initialKey={initialKeyValue}
            onUpdate={(key) => {settings.set("gridDBKey", key);}}
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
