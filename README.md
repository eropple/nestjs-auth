# `@eropple/nestjs-auth` #
Authentication and authorization on the web sucks.

There, I said it.

I don't mean the initial login process, though that kinda stinks too--we've got
the awesome Passport library to help us out there, though, and it really isn't
_that_ hard to write even OIDC or SAML correctly by hand. What sucks is
everything past that point. There are some interesting tools out there like
[Open Policy Agent](https://www.openpolicyagent.org) that are great if you want
to wrangle a microserviceful universe--but most applications don't need
microservices, most applications don't need to add a step to either their dev
setup or their prod environment to go configure a spooky-action-at-a-distance
service wedged into their environment--and most _developers_ need something that
gets out of the way so they can concentrate on building _the thing they actually
want to build_.

In my NestJS travels, I haven't found something that hits the important bits:

- **Do the simplest thing that can possibly work.** NestJS encourages some stuff
  that I have a pretty big problem with; in particular, the way the NestJS docs
  lead users by the hand down towards JWT--which is a minefield full of rabid
  alligators wielding rakes for you to step on, don't use JWT unless you know
  exactly why you need JWT and even then use something better, like [PASETO](),
  intead--makes me uncomfortable.
- **Fall into correctness.** It should be hard to do the wrong thing. By opting
  into `@eropple/nestjs-auth`, you should have a secure-by-default auth
  scheme and you should have to _explicitly_ opt out, whether to a less secure
  mode for a particular handler or to a completely unsecured mode. (This is the
  same principle behind `[@eropple/nestjs-data-sec]()`, for what it's worth.)
- **Support resource-based access control.** This is a big one to me. So many
  libraries out there want to give you simple role-based access control, and for
  a lot of stuff that's fine, but if you're building anything with any kind of
  multi-tenancy that's just not going to fly. And a lot of the solutions that
  _do_ support resource-based access control come packed with some heavy policy
  tooling that requires mapping from the application's domain modeling to that
  policy language. (If you want a policy language, I won't judge. But you should
  make that decision yourself and not have it pushed onto you by the thing that
  handles serving 401s and 403s.)

This is my take on attacking the problem. Not "once and for all," but maybe
"once more for the time I'm using NestJS".

**One important note:** this package is only tested to work with Express.
Fastify support is out of my personal scope for it; if you'd like it, I am happy
to accept PRs.

## Installation ##
It's an NPM package. It's called `@eropple/nestjs-auth`. Why do we all put
"here is how you write `npm install`/`yarn add` in our READMEs"? Why must we
perturb so many electrons for it? I mean...I think we know by now.

## Usage ##
`@eropple/nestjs-auth` provides the building blocks, but because of its
focus on extensibility--not prescribing to you how your domain objects should
work--I'm afraid you're going to have to do the wire-up yourself. Don't worry:
it's easy, and if it shows you some stuff you're unfamiliar with you're going to
benefit from learning how it works for your own code.

(As an aside: I've been asked why this is an interceptor rather than a guard.
That's because NestJS puts guards before interceptors, and if this was written
as a guard it'd mean that you couldn't put a logging interceptor around requests
that are rejected. It's harder to debug and harder to reason about.)

### How It Works ###
There's perilously little magic in `@eropple/nestjs-auth`. It provides two
interceptors, `HttpAuthnInterceptor` and `HttpAuthzInterceptor`, which need to
be attached to a module for injection (we'll cover that later). These
interceptors use their startup config and a set of decorators applied to handler
methods to determine who's allowed to access what.

#### Authentication ###
- `HttpAuthnInterceptor` retrieves an identity (PASETO token, session token
  string, etc.) through a user-defined function. This identity is stashed on the
  request object, turning it from an Express `Request` (from the NodeJS `http`
  package) into an `IdentifiedExpressRequest`, which we define as adding the
  `identity` property. This property is an `IdentityBill`, which contains a
  _principal_ ("who is this?"), a _credential_ ("what says that they're them?"),
  and a set of _scopes_ that we'll use to authorize access to some resources.
  If the user function determines that the identity is invalid--it's been
  revoked or has expired over time, for example--then that function can return
  `false`, and the requestor will immediately receive 401 Unauthorized.
- `HttpAuthnInterceptor` checks that identity. If no identity was found, it
  attaches to the request an _anonymous identity_, which can be given a set of
  scopes of its own.
- `HttpAuthnInterceptor` inspects the controller and its handler. By default,
  _all endpoints_ require authentication, but you can decorate your handlers
  with `@AuthnOptional()` to allow anonymous identities or with
  `@AuthnDisallowed()` to _require_ them. If the handler's requirement matches
  up with the identity on the request, the request continues; otherwise, the
  response is a 401 Unauthorized.

You can see a hypothetical example of a user identity function down below in
the **Module Injection** section.

_Note:_ if you want, you can just use `HttpAuthnInterceptor`. It wasn't built
for that, but there's no reason it can't work by itself. Obviously, scopes will
then be ignored.

#### Authorization ####
`@eropple/nestjs-auth` relies on three concepts for authorization: _scopes_,
_grants_, and _rights_.

##### Scopes #####
Zero or more _scopes_ are attached to every handler method by using the
`@AuthzScope()` decorator. An identity that has both a _grant_ and a _right_
to that scope is authorized to access the handler's endpoint. A list of example
scopes can be found below.

A method with zero scopes attached to it will always be allowed so long as the
identity authenticates correctly.

A method with no scope decorator attached to it will, once it hits the
`HttpAuthzInterceptor`, throw a 500 Internal Server Error.

##### Grants #####
Scopes provided to an identity are called _grants_. If a handler uses a scope
that is included in the identity's grants, then the identity is authorized to
use that handler. Since we use `[nanomatch]()`, you can use both `*` and `**`
(_[globstars]()_) in your identity's grants to expand the matches allowed.

##### Examples of Scopes and Grants #####
Here are some examples of hypothetical scopes and grants, based on different
resources:

- `user/view` - Allows viewing--for example, viewing private information such
  as email address--of the singleton resource `user`, implied to be "the
  current user".
- `user/edit` - Allows editing the singleton resource `user`, such as editing
  the user's profile.
- `user/session/list` - Allows listing all sub-resource `session`s within the
  singleton resource `user`. (If you made this `user/session` and implied the
  `/list` part, you'd have surprising behavior with the next one.)
- `user/*` (grant, not scope) - Allows any action on the singleton resource
  `user`. Implies both `user/view` and `user/edit`, but would not imply
  `user/session/list` (it would imply `user/session`, but as we just discussed
  that's not a valid scope.)
- `user/**/*` (grant, not scope) - Allows any action on `user` or subresource.
- `file/create` - Allows the creation of a new `file` resource (POST).
  Presumably, the response will include the ID of that file.
- `file/12345/view` - Allows viewing the `file` resource with id `12345`.
- `file/*/view` (grant, not scope) - Allows viewing of any `file` resource, but
  does not allow `file/create`.
- `**/*` (grant, not scope) - Superuser glob; allows any access to any resource.
  A login scope, where you're logging in directly, will typically have this
  permission unless you're implementing a GitHub-style "sudo pattern".

##### Rights #####
While _grants_ are provided by (or perhaps "on behalf of") the user, _rights_
determine what the user is actually allowed to access on a system level. For
example, a user might give an API token the scope `file/12345/view`--but that
doesn't mean that the user is _allowed_ to view file `12345`.

To that end, you must pass into `HttpAuthzInterceptor` what we refer to as the
**rights tree**. This is an object tree; children map to values in the `children`
If a scope is valid, its corresponding node in
the rights tree will have a `right` function that returns
`boolean | Promise<boolean>` so that you can check your source of truth to
ensure that the identity actually _does_ have the right to access the OAuth2
scope that you've granted.

Each node of the tree also may have a `context` method that can inject arbitrary
values into a local context that will be passed to descending contexts. For
example, if a path segment is a wildcard that represents a file ID and the file
ID doesn't exist, the `context` method can return a falsy value to tell the
requestor that they are unauthorized. `context` methods never _positively_
affirm a right, however; only a `right` method can do that.

The above example of a nonexistent file is a good time to note that neither
`context` nor `right` methods _do not_ handle exceptions; throwing an
`HttpException` will cause the response to be a 500 Internal Server Error. This
is a conscious decision--it might be tempting to say that we should return a 404
here, but returning a 404 here allows a potential attacker to identify when a
resource exists even if they don't have access to it. So we don't make that an
option.

You can see an example of a rights tree in **Module Injection**, below.

### Module Injection ###
Your application's module, which we'll call `MyAuthModule` for the rest of this
README, will need to tell NestJS how to build a `HttpAuthnInterceptor` and a
`HttpAuthzInterceptor`. We do this with a pair of [factory providers](). It'll
look a little something like this:

```ts
import { FactoryProvider } from '@nestjs/common/interfaces';

const authn: FactoryProvider = {
  provide: HttpAuthInterceptor,
  inject: [AuthService],
  useFactory: (authService: AuthService) => {
    // This function is how nestjs-auth derives the principal from the request.
    // For identified requests, the `IdentifiedBill` returned by this method
    // eventually becomes the `@Identity()` value passed as a parameter.
    //
    // `IdentifiedBill` is actually `IdentifiedBill<TPrincipal, TCredential>`,
    // and we can't actually reify that type, so feel free to create a type that
    // correctly expresses your principal and credential, i.e.:
    //
    // `export type MyAppBill = IdentifiedBill<User, UserToken>;`
    const principalFn: PrincipalFn =
      async (headers, cookies, _request): Promise<PrincipalFnRet> => {
        let input = cookies[TOKEN_HEADER] || headers[TOKEN_HEADER];
        const token: string | undefined = isArray(input) ? input[0] : input;

        if (!token) {
          return null;
        }

        const user = await authService.getUserForToken(token);
        if (!user) {
          return false;
        }

        return new IdentifiedBill(user, token, ["**/*"]);
      };

    return new HttpAuthnInterceptor({
      principalFn,
      anonymousScopes: ["ping"]
    });
  }
};

const authz: FactoryProvider = {
  provide: HttpAuthzInterceptor,
  inject: [FileService],
  useFactory: (fileService: FileService) => {
    const tree: RightsTree = {
      children: {
        user: {
          children: {
            view: {
              // `user/view` is scoped to the logged-in user, and so if the
              // identity has the grant `user/view` there's no reason to stop
              // them from logging in. So the right is always true.
              right: () => true
            }
          }
        },
        file: {
          children: {
            create: {
              // The FileService knows if the user is _actually_ allowed to create
              // a file, so we must defer to it here. If this was more elaborated,
              // file resources might belong to organizations and organizations might
              // have roles with the ability to create files. In such a case we'd
              // need to explore whatever permissions we'd granted to those
              // roles.
              //
              // The `request` object is a sub-interface of Express's `Request`
              // that is guaranteed to include an `identity`. See the
              // `IdentifiedExpressRequest` interface for details.
              right: (_scopePart, request, _locals) => fileService.userCanCreate(request.identity.principal)
            },
          },
          // Any scope that isn't `file/create` will fall through to the wildcard.
          // Both `context` and `right` methods receive the current scope part
          // as the `scopePart` variable.
          wildcard: {
            context: async (scopePart, request, locals) => {
              // Let's assume that this method returns a `FileInfo` on success
              // and `null` on failure, so...
              locals.file = await FileService.getFileInfoById(scopePart);

              // `!!` makes a value explicitly true or false from a truthy or
              // falsy value, just to make this clearer; therefore, if no
              // file exists with the id of the `scopePart` value, this will
              // return false. If context functions return false, 403 Forbidden
              // will be sent to the client.
              //
              // This ensures that an unauthorized client can't poke at your
              // resource IDs until they get a 404 instead of a 403, and go
              // "ooh, that one exists!".
              return !!(locals.file);
            }
            children: {
              view: {
                right: async (scopePart, request, locals) => {
                  const file: FileInfo = locals.file!;

                  return FileService.userCanView(request.identity.principal, file);
                }
              }
            }
          }
        }
        ping: {
          // You can always ping, whether or not you're logged in. You could
          // (and IMO should) instead go `@AuthzScope([])` rather than wasting
          // time walking the rights tree for something that always works
          // regardless of whether you have an identified or anonymous identity,
          // but it's here for completeness.
          right: () => true
        }
      }
    };

    return new HttpAuthzInterceptor({
      tree,
      logger: ROOT_LOGGER.child({ component: "HttpAuthz" })
    });
  }
};

@Module({
  imports: [],
  providers: [
    AuthService,
    authn
  ],
  exports: [AuthService, AuthRequired, HttpAuthnInterceptor]
})
export class AuthModule {}
```

_One helpful note:_ you might want to refer to NestJS's documentation on
[circular dependencies]() when writing this; forward references are a little
tricky.

### Setting Up ###
Once you've got your module wired up, you need to attach the authentication and
the authorization interceptors to your application. There are two ways to do
this; one is way better than the other.

#### The Good, Happy Path That Leads To Success ####
```ts
import {
  HttpAuthnInterceptor,
  HttpAuthzInterceptor
} from "@eropple/nestjs-auth";

// put this after your logging interceptor but before any others
app.useGlobalInterceptors(
  app.get(HttpAuthnInterceptor),
  app.get(HttpAuthzInterceptor)
);
```

I'm of two minds about global interceptors and guards. You have to replicate
them in testing situations (please remember to add this to your E2E tests, too!)
and that can lead to some confusion. On the other hand, this is the _only_ way
to assert "everything is authenticated and authorized by default".

#### The Dubious Path of Only Moderate Happiness ####
```ts
@UseInterceptors(HttpAuthnInterceptor, HttpAuthzInterceptor)
@Controller("foo")
export FooController {

}
```

I don't recommend this approach for a couple of reasons. The first is that this
makes authentication and authorization significantly less predictable--if your
controllers have to opt into auth, you'll eventually write a controller that
_forgets_ it. Hilarity may ensue. Or not. (Trying to use `@Identity()` without
a valid identity created by `HttpAuthnInterceptor` will throw an exception,
though.)

There are situations where you'll have to do this, such as using this system
in an existing NestJS app, but I'd advise against it.

## Future Work ##
- socket.io authorization/authentication
- an end-to-end example application using `@eropple/nestjs-auth`
- tests - the tests for this exist in the original app it was extracted from,
  they need to be cleaned up and made available here.


[PASETO]: https://paseto.io/
[@eropple/nestjs-data-sec]: https://github.com/eropple/nestjs-data-sec
[nanomatch]: https://www.npmjs.com/package/nanomatch
[globstars]: https://www.linuxjournal.com/content/globstar-new-bash-globbing-option
[factory provider]: https://docs.nestjs.com/fundamentals/custom-providers#use-factory
[circular dependencies]: https://docs.nestjs.com/fundamentals/circular-dependency
