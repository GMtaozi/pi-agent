import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  export interface FastifyInstance {
    log: {
      error: (obj: Record<string, unknown> | string, ...args: unknown[]) => void;
      warn: (obj: Record<string, unknown> | string, ...args: unknown[]) => void;
      info: (obj: Record<string, unknown> | string, ...args: unknown[]) => void;
      debug: (obj: Record<string, unknown> | string, ...args: unknown[]) => void;
    };
  }
  
  export interface FastifyRequest<
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    Context = any,
    ParsedRequest extends FastifyRequest<RouteGeneric, Context> = FastifyRequest<RouteGeneric, Context>
  > {
    query: RouteGeneric extends { Querystring: infer Q } ? Q : unknown;
    params: RouteGeneric extends { Params: infer P } ? P : unknown;
    body: RouteGeneric extends { Body: infer B } ? B : unknown;
  }
}

declare namespace Fastify {
  export type FastifyRequest = import('fastify').FastifyRequest;
  export type FastifyReply = import('fastify').FastifyReply;
  export type FastifyInstance = import('fastify').FastifyInstance;
}