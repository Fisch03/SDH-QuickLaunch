import {
  definePlugin,
  Menu,
  MenuItem,
  ServerAPI,
  showContextMenu,
  staticClasses,
  Dropdown,
  DropdownOption,
  PanelSection,
  PanelSectionRow,
  ButtonItem
} from "decky-frontend-lib";
import { Fragment, useLayoutEffect } from "react";
import { VFC, useState } from "react";
import { FaRocket } from "react-icons/fa";

import { App } from "./apptypes";
import { fetchApps, launchApp } from "./utils";

let appList: App[] = [];

const Content: VFC<{ serverAPI: ServerAPI }> = ({ serverAPI }) => {
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<number | null>(null);

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
          <ButtonItem layout="below" onClick={() => {if(selectedApp !== null) launchApp(serverAPI, appList[selectedApp])}}>
            Launch!
          </ButtonItem>
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
