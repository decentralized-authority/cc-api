import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { httpErrorResponse } from './util';
import { isArray, isBoolean, isNull, isNumber, isString, isPlainObject } from 'lodash';

interface BodyStructureObj {
  [key: string]: any
}
interface HandlerObj {
  handler: (event: APIGatewayProxyEvent)=>Promise<APIGatewayProxyResult>
  auth: boolean
  bodyStructure: BodyStructureObj|null
}
export interface DocsObj {
  [route: string]: {
    method: string,
    auth: boolean,
    reqBody: {[key: string]: string
    }|null}[]
}

const valueToString = (item: any): any => {
  if(isArray(item)) {
    if(item.length > 0) {
      return `${valueToString(item[0])}[]`;
    } else {
      return '[]';
    }
  } else if(isBoolean(item)) {
    return 'boolean';
  } else if(isNumber(item)) {
    return 'number';
  } else if(isString(item)) {
    return 'string';
  } else {
    return 'unknown';
  }
};
const bodyStructureToDocs = (bodyStructureObj: BodyStructureObj|null): {[key: string]: string}|null => {
  if(!bodyStructureObj) {
    return null;
  }
  const output: {[key: string]: string} = {};
  for(const [ key, val ] of Object.entries(bodyStructureObj)) {
    output[key] = valueToString(val);
  }
  return output;
};

export class CCServer {

  _handlers = new Map<string, Map<string, HandlerObj>>();

  _registerHandler(method: string, route: string, handler: (event: APIGatewayProxyEvent)=>Promise<APIGatewayProxyResult>, auth: boolean, bodyStructure: BodyStructureObj|null) {
    if(!this._handlers.has(route))
      this._handlers.set(route, new Map());
    this._handlers.get(route)?.set(method, {
      handler,
      auth,
      bodyStructure,
    });
  }

  async handle(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const { httpMethod, resource } = event;
      const routeHandlers = this._handlers.get(resource);
      if(!routeHandlers)
        return httpErrorResponse(404, 'Not Found');
      const handlerObj = routeHandlers.get(httpMethod);
      if(!handlerObj)
        return httpErrorResponse(405, 'Method not allowed');
      return await handlerObj.handler(event);
    } catch(err) {
      console.error(err);
      return httpErrorResponse(500, 'Internal server error');
    }
  }

  get(route: string, handler: (event: APIGatewayProxyEvent)=>Promise<APIGatewayProxyResult>, auth: boolean, bodyStructure: BodyStructureObj|null): CCServer {
    this._registerHandler('GET', route, handler, auth, bodyStructure);
    return this;
  }

  post(route: string, handler: (event: APIGatewayProxyEvent)=>Promise<APIGatewayProxyResult>, auth: boolean, bodyStructure: BodyStructureObj|null): CCServer {
    this._registerHandler('POST', route, handler, auth, bodyStructure);
    return this;
  }

  docs(ignore: string[] = []): DocsObj {
    const routes = [...this._handlers.keys()];
    const output: DocsObj = {};
    for(const route of routes) {
      if(ignore.includes(route))
        continue;
      const handlers = this._handlers.get(route);
      if(!handlers)
        continue;
      const availableMethods = [...handlers.keys()];
      for(const method of availableMethods) {
        const handlerObj = handlers.get(method);
        if(!handlerObj)
          continue;
        if(!output[route])
          output[route] = [];
        output[route].push({
          method,
          auth: handlerObj.auth,
          reqBody: bodyStructureToDocs(handlerObj.bodyStructure),
        });
      }
    }
    return output;
  }

}
