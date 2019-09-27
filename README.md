# `@eropple/nestjs-auth` #
[![npm version](https://badge.fury.io/js/%40eropple%2Fnestjs-auth.svg)](https://badge.fury.io/js/%40eropple%2Fnestjs-auth)

## Current Status ##
`0.3.x` is being used, in anger, on multiple production apps, at my current
employer and by other NestJS users.

### Recent Changes ###
#### 0.3.0 / 0.3.1 (bug fix) ####
- `nestjs-auth` now expects template arguments around principals and (optionally)
  credentials. Take a look at [the example](https://github.com/eropple/nestjs-auth-example)
  for details.
- Replaced `HttpAuthnInterceptor` and `HttpAuthzInterceptor` with a single
  interceptor, `HttpAuthxInterceptor`. This is because NestJS offers no explicit
  way to guarantee that two request-scoped interceptors will run in the correct
  order. Order-of-declaration works but I don't consider it sufficiently reliable
  and it's easy enough to pass an `always` right as part of the tree if you wish
  to opt out of authz.

#### 0.2.2 ####
- Continued extending type system, this time on the authn side, to reduce the
  number of places where programmers have to trust their feeble brainmeats to do
  the right thing.

#### 0.2.1 ####
- Added generic types (with concrete default parameters) to ease type safety
  concerns when writing things like rights trees. In 0.3.0, the top-level
  generic parameters (things like `HttpAuthnInterceptor`) will lose their
  default values (where they currently map directly to `IdentifiedBill`), to
  encourage consumers to define their own top-level types and use them in their
  applications.

## Introduction ##

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
  exactly why you need JWT and even then use something better, like
  [PASETO](https://paseto.io/), intead--makes me uncomfortable.
- **Fall into correctness.** It should be hard to do the wrong thing. By opting
  into `@eropple/nestjs-auth`, you should have a secure-by-default auth scheme
  and you should have to _explicitly_ opt out, whether to a less secure mode for
  a particular handler or to a completely unsecured mode. (This is the same
  principle behind
  `[@eropple/nestjs-data-sec](https://github.com/eropple/nestjs-data-sec)`, for
  what it's worth.)
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
It's an NPM package. It's called `@eropple/nestjs-auth`. Wield your package
manager of choice and install it.

Just remember that you gotta have NestJS 6.5 or newer to make this work.

## Usage ##
**Before you read all this:** code can speak for itself. Please consider
checking out
[@eropple/nestjs-auth-example](https://github.com/eropple/nestjs-auth-example);
it is _exhaustively_ commented and has end-to-end tests that demonstrate
`@eropple/nestjs-auth`'s completeness.

`@eropple/nestjs-auth` provides the building blocks, but because of its focus on
extensibility--not prescribing to you how your domain objects should work--I'm
afraid you're going to have to do the wire-up yourself. Don't worry: it's easy,
and if it shows you some stuff you're unfamiliar with you're going to benefit
from learning how it works for your own code.

(As an aside: I've been asked why this is an interceptor rather than a guard.
That's because NestJS puts guards before interceptors, and if this was written
as a guard it'd mean that you couldn't put a logging interceptor around requests
that are rejected. It's harder to debug and harder to reason about.)

### How It Works ###
There's perilously little magic in `@eropple/nestjs-auth`. It provides one
interceptor, `HttpAuthxInterceptor`, which needs to be attached to a module for
injection (we'll cover that later). These interceptors use their startup config
and a set of decorators applied to handler methods to determine who's allowed to
access what.

**NOTE:** Version 0.2.x used two interceptors. This proved to be not-that-great
if you wanted to use a request-scoped `nestjs-auth` (for example, you use
request-scoped services in your rights tree), because even after the NestJS 6.5
fixes that allow you to properly do request-scoped interceptors the ordering of
them is undefined. In practice, they load in the order they're declared, but I
don't really want to rely on that and I don't think you should either, so 0.3.0
collapses them into a single interceptor.

#### Authentication ###
- The _authn step_ retrieves an identity (PASETO token, session token string,
  etc.) through a user-defined function. This identity is stashed on the request
  object, turning it from an Express `Request` (from the NodeJS `http` package)
  into an `IdentifiedExpressRequest`, which we define as adding the `identity`
  property. This property is an `IdentityBill`, which contains a _principal_
  ("who is this?"), a _credential_ ("what says that they're them?"), and a set
  of _scopes_ that we'll use to authorize access to some resources. If the user
  function determines that the identity is invalid--it's been revoked or has
  expired over time, for example--then that function can return `false`, and the
  requestor will immediately receive 401 Unauthorized.
- The _authz step_ checks that identity. If no identity was found, it attaches
  to the request an _anonymous identity_, which can be given a set of scopes of
  its own.
- `HttpAuthnInterceptor` inspects the controller and its handler. By default,
  _all endpoints_ require authentication, but you can decorate your handlers
  with `@AuthnOptional()` to allow anonymous identities or with
  `@AuthnDisallowed()` to _require_ them. If the handler's requirement matches
  up with the identity on the request, the request continues; otherwise, the
  response is a 401 Unauthorized.


#### Authorization ####
`@eropple/nestjs-auth` relies on three concepts for authorization: _scopes_,
_grants_, and _rights_.

##### Scopes #####
Zero or more _scopes_ are attached to every handler method by using the
`@AuthzScope()` decorator. An identity that has both a _grant_ and a _right_ to
that scope is authorized to access the handler's endpoint. A list of example
scopes can be found below.

A method with zero scopes attached to it will always be allowed so long as the
identity authenticates correctly.

A method with no scope decorator attached to it will, once it hits the
`HttpAuthzInterceptor`, throw a 500 Internal Server Error.

##### Grants #####
Scopes provided to an identity are called _grants_. If a handler uses a scope
that is included in the identity's grants, then the identity is authorized to
use that handler. Since we use
`[nanomatch](https://www.npmjs.com/package/nanomatch)`, you can use both `*` and
`**`
(_[globstars](https://www.linuxjournal.com/content/globstar-new-bash-globbing-option)_)
in your identity's grants to expand the matches allowed.

##### Examples of Scopes and Grants #####
Here are some examples of hypothetical scopes and grants, based on different
resources:

- `user/view` - Allows viewing--for example, viewing private information such as
  email address--of the singleton resource `user`, implied to be "the current
  user".
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
**rights tree**. This is an object tree; children map to values in the
`children` If a scope is valid, its corresponding node in the rights tree will
have a `right` function that returns `boolean | Promise<boolean>` so that you
can check your source of truth to ensure that the identity actually _does_ have
the right to access the OAuth2 scope that you've granted.

Once we've gotten to the authz step, you can take as guaranteed that we have
added a `locals` field to the request. As such, each node may have a `context`
method that can test against the current request, potentially to short-circuit
and return 403 early but also to potentially store request-local data for other
uses.. For example, if a path segment is a wildcard that represents a file ID
and the file ID doesn't exist, the `context` method can return a falsy value to
tell the requestor that they are unauthorized; if it does exist, the `context`
method can attach the file entity to `request.locals` (which can then be used by
deeper parts of the rights tree or be used for parameter injection in your
handlers). `context` methods never _positively_ affirm a right, however; only a
`right` method can do that.

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
README, will need to tell NestJS how to build a `HttpAuthxInterceptor`. We do
this with a [factory
provider](https://docs.nestjs.com/fundamentals/custom-providers#use-factory);
you can see how to do this in [the example project's module
injection](https://github.com/eropple/nestjs-auth-example/tree/master/src/authx).

_One helpful note:_ you might want to refer to NestJS's documentation on
[circular
dependencies](https://docs.nestjs.com/fundamentals/circular-dependency) when
writing this; forward references are a little tricky.

### Setting Up ###
Once you've got your module wired up, you need to attach the authentication and
the authorization interceptors to your application. There are two ways to do
this; one is way better than the other.

#### The Good, Happy Path That Leads To Success ####
It's a little long to put here. Please take a look at [the example project](https://github.com/eropple/nestjs-auth-example/tree/master/src/authx).

I'm of two minds about global interceptors and guards. You have to replicate
them in testing situations (please remember to add this to your E2E tests, too!)
and that can lead to some confusion. On the other hand, this is the _only_ way
to assert "everything is authenticated and authorized by default".

## Future Work ##
- socket.io authorization/authentication
- tests - the tests for this exist in the original app it was extracted from,
  they need to be cleaned up and made available here.
