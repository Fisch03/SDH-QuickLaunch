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
import { fetchApps, launchApp, createShortcut, setLaunchOptions } from "./utils";

let appList: App[] = [];

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<number | null>(null);
  const [createNewShortcut, setCreateNewShortcut] = useState(false);
  const [buttonText, setButtonText] = useState<string>();

  useLayoutEffect(() => {
    (async () => {
      appList = await fetchApps(serverAPI);
      setDropdownOptions(appList.map((a, i) => {return { data: i, label: a.name } as DropdownOption}));
      /*showContextMenu(
        <Menu label="Menu" cancelText="Plugin Menu" onCancel={() => {}}>
          {
            appList.map((app, i) => (
              <MenuItem onSelected={() => setSelectedApp(i)}>{app.name}</MenuItem>
            ))
          }
        </Menu>
      )*/
    })();
  }, []);

  useLayoutEffect(() => {
    createNewShortcut? setButtonText("Create!") : setButtonText("Launch!");
  }, [createNewShortcut]);

  function doButtonAction() {
    if(selectedApp === null) return;

    let app = appList[selectedApp];
    if(createNewShortcut) {
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
            checked={createNewShortcut}
            onChange={(e) => setCreateNewShortcut(e)}
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
