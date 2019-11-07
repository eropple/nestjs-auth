import * as _ from 'lodash';

export function getAllMetadata(o: any) {
  return _.fromPairs(Reflect.getMetadataKeys(o).map(k => [k, Reflect.getMetadata(k, o)]));
}

export function getAllPropertyMetadata(o: any, key: string | symbol) {
  return _.fromPairs(Reflect.getMetadataKeys(o, key).map(k => [k, Reflect.getMetadata(k, o, key)]));
}

export function doAppendArrayMetadata<V>(
  metadataKey: string,
  metadataValue: V | Array<V>,
  target: any,
  key?: string | symbol,
) {
  const current =
    (key
      ? Reflect.getMetadata(metadataKey, target, key)
      : Reflect.getMetadata(metadataKey, target)
    ) || [];
  const values = _.flattenDeep<V>([ current, metadataValue ]);

  if (key) {
    Reflect.defineMetadata(metadataKey, values, target, key);
  } else {
    Reflect.defineMetadata(metadataKey, values, target);
  }

  if (process.env.NESTJS_AUTH_BUILD_TIME_DEBUG) {
    // tslint:disable-next-line: no-console
    console.log(target, key, 'before: ', current, 'after: ', values);
  }
}

export function AppendArrayMetadata<V>(
  metadataKey: string,
  metadataValue: V | Array<V>,
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    doAppendArrayMetadata(metadataKey, metadataValue, target, propertyKey);

    if (process.env.NESTJS_AUTH_BUILD_TIME_DEBUG) {
      // tslint:disable-next-line: no-console
      console.log(`${target} : ` +
        `${propertyKey && String(propertyKey)} @ ` +
        `${metadataKey}: ${Reflect.getMetadata(metadataKey, target, propertyKey)}`);
    }
  };
}
