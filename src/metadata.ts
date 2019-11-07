import * as _ from 'lodash';

export function getAllMetadata(o: any) {
  return _.fromPairs(Reflect.getMetadataKeys(o).map(k => [k, Reflect.getMetadata(k, o)]));
}

export function getAllParameterMetadata(o: any, key: string | symbol) {
  return _.fromPairs(Reflect.getMetadataKeys(o, key).map(k => [k, Reflect.getMetadata(k, o, key)]));
}

export function doAppendArrayMetadata<V>(
  metadataKey: string,
  metadataValue: V | Array<V>,
  target: any,
  key?: string | symbol,
) {
  const current = (key ? Reflect.getMetadata(metadataKey, target, key) : Reflect.getMetadata(metadataKey, target)) || [];
  const values = _.flattenDeep<V>([ current, metadataValue ]);

  if (key) {
    Reflect.defineMetadata(metadataKey, values, target, key);
  } else {
    Reflect.defineMetadata(metadataKey, values, target);
  }
}

export function AppendArrayMetadata<V>(
  metadataKey: string,
  metadataValue: V | Array<V>,
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    doAppendArrayMetadata(metadataKey, metadataValue, target, propertyKey);

    if (process.env.NESTJS_AUTH_BUILD_TIME_DEBUG) {
      process.stderr.write(`${target} : ` +
        `${propertyKey && String(propertyKey)} @ ` +
        `${metadataKey}: ${Reflect.getMetadata(metadataKey, target, propertyKey)}` +
        `\n`);
    }
  };
}
