import { ServerResponse } from "http";
import { Observable } from "rxjs";

import { StringTo } from "./helper-types";

export function observableResponse(response: ServerResponse, msg: StringTo<any>, code: number): Observable<any> {
  response.statusCode = code;
  response.setHeader("content-type", "application/json");
  response.flushHeaders();
  response.write(JSON.stringify(msg));
  response.end();

  return Observable.create();
}
