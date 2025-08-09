import {
  ServerAPI,
  ConfirmModal,
  ToastData,
  TextField,
  FilePickerRes,
  ToggleField
} from "decky-frontend-lib"
import { useEffect, useState } from "react"
import { App } from "./apptypes"

import { createAppShortcut, launchApp } from "./appoperations"
import { Settings } from "./settings"

export const FileOptionsModal = (props: {closeModal?: CallableFunction, settings: Settings, starApp: CallableFunction, filepath: FilePickerRes, serverAPI: ServerAPI}) => {
  const closeModal = () => { if (props.closeModal) {props.closeModal()} }
  const {settings, starApp, filepath, serverAPI} = props
  const [appName, setAppName] = useState<string>(filepath.path)
  const [compatTool, setCompatTool] = useState<string|undefined>()
  const [addToFavorites, setAddToFavorites] = useState<boolean>(false)
  const [addAsShortcut, setAddAsShortcut] = useState<boolean>(false)
  const [useFolderAsAppName, setUseFolderAsAppName] = useState<boolean>(true)
  const [fileAppName, setFileAppName] = useState<string>('')
  const [folderAppName, setFolderAppName] = useState<string>('')

  useEffect(()=>{
    let parts = filepath.realpath.split(/[\\\/]/).filter(p => p);
    let filenameWithExtension = parts.pop() || ''; // 文件名带扩展名
    let folderName = parts.pop() || 'DefaultFolder'; // 当前文件夹名称
    let filename = filenameWithExtension;
    let fileext = '';
    if (filenameWithExtension) {
      const lastDotIndex = filenameWithExtension.lastIndexOf('.');
      if (lastDotIndex !== -1) {
        filename = filenameWithExtension.slice(0, lastDotIndex);
        fileext = filenameWithExtension.slice(lastDotIndex + 1).toLowerCase();
      }
    }
    let path = filepath.realpath.substring(0, filepath.realpath.length - (filenameWithExtension ? filenameWithExtension.length : 0));
    localStorage.setItem('decky-addtosteam', path);
    let calculatedFileAppName = filename || filenameWithExtension || 'MissingAppName';
    setFileAppName(calculatedFileAppName);
    setFolderAppName(folderName);
    setAppName(useFolderAsAppName ? folderName : calculatedFileAppName);
    if (['exe', 'bat'].includes(fileext)) setCompatTool('proton-experimental');
  },[]);

  useEffect(() => {
    setAppName(useFolderAsAppName ? folderAppName : fileAppName);
  }, [useFolderAsAppName, folderAppName, fileAppName]);

  const onOK = () => {
    let app: App = {
      name: appName,
      exec: filepath.realpath,
      compatTool: compatTool
    }

    if (addAsShortcut) { 
      createAppShortcut(serverAPI, app, settings, "", app.exec)

      let toastData: ToastData = {
        title: 'Added Shortcut',
        body: appName,
        playSound: true,
        showToast: true
      }
      serverAPI.toaster.toast(toastData)
    } else if (addToFavorites) {
      //TODO: Doing this looses information about the compat tool. An app should also be able to store data about compat tools.
      starApp(app);
    } else {
      launchApp(serverAPI, app);
    }
  }

  const nameField = <TextField
    label='Name'
    focusOnMount={true}
    value={appName}
    onChange={(e) => setAppName(e.currentTarget.value)} 
  />

  return (
    <ConfirmModal
      strTitle='File Options'
      strOKButtonText={addAsShortcut ? 'Add Shortcut' : addToFavorites ? 'Add to starred Apps' : 'Launch'}
      closeModal={closeModal}
      onOK={onOK}
      onCancel={closeModal}
      onEscKeypress={closeModal}
    >
      <ToggleField 
        label='Add to favorites' 
        checked={addToFavorites} 
        onChange={addToFavorites => {
          setAddToFavorites(addToFavorites);
          if(addToFavorites) setAddAsShortcut(false);
        }} 
      />

      <ToggleField 
        label='Add as shortcut' 
        checked={addAsShortcut} 
        onChange={addAsShortcut => {
          setAddAsShortcut(addAsShortcut);
          if(addAsShortcut) setAddToFavorites(false);
        }} 
      />

      <ToggleField 
        label='Use folder as app name' 
        checked={useFolderAsAppName} 
        onChange={value => setUseFolderAsAppName(value)} 
      />

      { (addToFavorites || addAsShortcut) && nameField }
      
    </ConfirmModal>
  )
}
