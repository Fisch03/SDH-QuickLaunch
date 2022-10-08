import { ButtonItem, ModalRoot, ServerAPI, showModal, TextField } from "decky-frontend-lib";
import { Component } from "react";

interface APIResponse {
  success: boolean
}

interface SearchAPIResponse extends APIResponse {
  data: SearchObject[]
}
interface SearchObject {
  id: number
  name: string
  types: string[]
  verified: boolean
}

interface ImageAPIResponse extends APIResponse {
  success: boolean;
  data: APIImage[]
}
interface APIImage {
  id: number,
  score: number,
  style: "alternate" | "blurred" | "nologo" | "material" | "whitelogo",
  url: string,
  thumb: string,
  tags: string[],
  author: SteamUser
}

interface SteamUser {
  name: string,
  steam64: string,
  avatar: string,
}
interface ImageCollection {
  Grid: string | null,
  Hero: string | null,
  Logo: string | null,
  GridH: string | null
}

interface ImageChunk {
  data: string;
  is_last: boolean;
}
export class GridDBPanel extends Component<{ enabled: boolean, key: string, updateKey: (key: string) => void }> {
  constructor(props:any) {
    super(props);
  }

  render() {
    if(this.props.enabled) {
      return (
        <ButtonItem
          onClick={() => {
            showModal(
              <ModalRoot
                bAllowFullSize={true}
              >
                <TextField
                  label="SteamGridDB Key"
                  value={this.props.key}
                  onChange={(e) => {this.props.updateKey(e?.target.value)}}
                />
              </ModalRoot>
            )
          }}
        >
          Set New SteamGridDB API Key 
        </ButtonItem>
      )
    }
    return null;
  }
}

function apiRequest(sAPI: ServerAPI, key:string, endpoint: string, data: string | number) {
  return new Promise<APIResponse>((resolve, reject) => {
    sAPI.callPluginMethod<any, APIResponse>("get_req_json", {url: `https://www.steamgriddb.com/api/v2${endpoint}/${data}`, auth: key})
    .then(data => {resolve(data.result as APIResponse)})
    .catch(err => reject(err))
  })
}

function downloadImageB64(sAPI: ServerAPI, url: string) {
  return new Promise<any>((resolve, reject) => { 
    sAPI.callPluginMethod<any, ImageChunk>("get_req_imgb64", {url: url})
    .then(async (res) => {
      if(!res.success) reject(res.result); 
      
      let chunk: ImageChunk = res.result as ImageChunk;
      let imgB64: string = chunk.data;

      while(!chunk.is_last) {
        let res = await sAPI.callPluginMethod<any, ImageChunk>("receive_next_chunk", {})
        if(!res.success) reject(res.result); 

        chunk = res.result as ImageChunk;
        imgB64 += chunk.data;
      };

      resolve(imgB64);
    })
  })
}

const searchGame = (sAPI: ServerAPI, key: string, gameName: string) => apiRequest(sAPI, key, "/search/autocomplete", gameName) as Promise<SearchAPIResponse>
const getGrids   = (sAPI: ServerAPI, key: string, gameID: number)   => apiRequest(sAPI, key, "/grids/game",          gameID)   as Promise<ImageAPIResponse>
const getHeroes  = (sAPI: ServerAPI, key: string, gameID: number)   => apiRequest(sAPI, key, "/heroes/game",         gameID)   as Promise<ImageAPIResponse>
const getLogos   = (sAPI: ServerAPI, key: string, gameID: number)   => apiRequest(sAPI, key, "/logos/game",          gameID)   as Promise<ImageAPIResponse>
//const getGridH   = (sAPI: ServerAPI, key: string, gameID: number)   => apiRequest(sAPI, key, "/grids/game",          gameID)   as Promise<ImageAPIResponse>



export function getImagesForGame(sAPI: ServerAPI, key: string, gameName: string): Promise<ImageCollection> {
  return new Promise<ImageCollection>((resolve, reject) => {
    searchGame(sAPI, key, gameName)
      .then(res => {
        let id: number = res.data[0].id;
        let images: ImageCollection = {Grid: null, Hero: null, Logo: null, GridH: null};

        getGrids(sAPI, key, id)
        .then(res => downloadImageB64(sAPI, res.data[0].url))
        .then(img => {
          images.Grid = img;
          return getHeroes(sAPI, key, id)
        })
        .then(res => downloadImageB64(sAPI, res.data[0].url))
        .then(img => {
         images.Hero = img;
          return getLogos(sAPI, key, id)
        })
        .then(res => downloadImageB64(sAPI, res.data[0].url))
        .then(img => {
          images.Logo = img;
          resolve(images);
        })
        .catch(err => { reject(err); })
      })
      .catch(err => { reject(err); })
  })
}