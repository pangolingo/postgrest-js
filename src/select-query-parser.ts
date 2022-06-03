// Credits to @bnjmnt4n (https://www.npmjs.com/package/postgrest-query)

type Whitespace = ' ' | '\n' | '\t'

type LowerAlphabet =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z'

type Alphabet = LowerAlphabet | Uppercase<LowerAlphabet>

type Digit = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0'

type Letter = Alphabet | Digit | '_'

// /**
//  * Parsed node types.
//  * Currently only `*` and all other fields.
//  */
// type ParsedNode =
//   | { star: true }
//   | { name: string; original: string }
//   | { name: string; foreignTable: true };

/**
 * Parser errors.
 */
type ParserError<Message extends string> = { error: true } & Message
type GenericStringError = ParserError<'Received a generic string'>

/**
 * Trims whitespace from the left of the input.
 */
type EatWhitespace<Input extends string> = string extends Input
  ? GenericStringError
  : Input extends `${Whitespace}${infer Remainder}`
  ? EatWhitespace<Remainder>
  : Input

/**
 * Constructs a type definition for a single field of an object.
 *
 * @param Definitions Record of definitions, possibly generated from PostgREST's OpenAPI spec.
 * @param Name Name of the table being queried.
 * @param Field Single field parsed by `ParseQuery`.
 */
type ConstructFieldDefinition<Table extends Record<string, unknown>, Field> = Field extends {
  star: true
}
  ? Table
  : Field extends { name: string; foreignTable: true }
  ? { [K in Field['name']]: unknown }
  : Field extends { name: string; original: string }
  ? { [K in Field['name']]: Table[Field['original']] }
  : Record<string, unknown>

/**
 * Notes: all `Parse*` types assume that their input strings have their whitespace
 * removed. They return tuples of ["Return Value", "Remainder of text"] or
 * a `ParserError`.
 */

/**
 * Reads a consecutive sequence of more than 1 letter,
 * where letters are `[0-9a-zA-Z_]`.
 */
type ReadLetters<Input extends string> = string extends Input
  ? GenericStringError
  : ReadLettersHelper<Input, ''> extends [`${infer Letters}`, `${infer Remainder}`]
  ? Letters extends ''
    ? ParserError<`Expected letter at \`${Input}\``>
    : [Letters, Remainder]
  : ReadLettersHelper<Input, ''>

type ReadLettersHelper<Input extends string, Acc extends string> = string extends Input
  ? GenericStringError
  : Input extends `${infer L}${infer Remainder}`
  ? L extends Letter
    ? ReadLettersHelper<Remainder, `${Acc}${L}`>
    : [Acc, Input]
  : [Acc, '']

/**
 * Parses an identifier.
 * For now, identifiers are just sequences of more than 1 letter.
 *
 * TODO: allow for double quoted strings.
 */
type ParseIdentifier<Input extends string> = ReadLetters<Input>

/**
 * Parses a node.
 * A node is one of the following:
 * - `*`
 * - `field`
 * - `field(nodes)`
 * - `renamed_field:field`
 * - `renamed_field:field(nodes)`
 * - `renamed_field:field!hint(nodes)`
 *
 * TODO: casting operators `::text`, JSON operators `->`, `->>`.
 */
type ParseNode<Input extends string> = Input extends ''
  ? ParserError<'Empty string'>
  : // `*`
  Input extends `*${infer Remainder}`
  ? [{ star: true }, EatWhitespace<Remainder>]
  : ParseIdentifier<Input> extends [infer Name, `${infer Remainder}`]
  ? EatWhitespace<Remainder> extends `:${infer Remainder}`
    ? ParseIdentifier<EatWhitespace<Remainder>> extends [infer OriginalName, `${infer Remainder}`]
      ? EatWhitespace<Remainder> extends `!${infer Remainder}`
        ? ParseIdentifier<EatWhitespace<Remainder>> extends [infer _Hint, `${infer Remainder}`]
          ? ParseEmbeddedResource<EatWhitespace<Remainder>> extends [
              infer _Fields,
              `${infer Remainder}`
            ]
            ? // `renamed_field:field!hint(nodes)`
              [
                {
                  name: Name
                  foreignTable: true
                },
                EatWhitespace<Remainder>
              ]
            : ParseEmbeddedResource<EatWhitespace<Remainder>> extends ParserError<string>
            ? ParseEmbeddedResource<EatWhitespace<Remainder>>
            : ParserError<'Expected embedded resource after `!hint`'>
          : ParserError<'Expected identifier after `!`'>
        : ParseEmbeddedResource<EatWhitespace<Remainder>> extends [
            infer _Fields,
            `${infer Remainder}`
          ]
        ? // `renamed_field:field(nodes)`
          [{ name: Name; foreignTable: true }, EatWhitespace<Remainder>]
        : ParseEmbeddedResource<EatWhitespace<Remainder>> extends ParserError<string>
        ? ParseEmbeddedResource<EatWhitespace<Remainder>>
        : // `renamed_field:field`
          [{ name: Name; original: OriginalName }, EatWhitespace<Remainder>]
      : ParseIdentifier<EatWhitespace<Remainder>>
    : ParseEmbeddedResource<EatWhitespace<Remainder>> extends [infer _Fields, `${infer Remainder}`]
    ? // `field(nodes)`
      [{ name: Name; foreignTable: true }, EatWhitespace<Remainder>]
    : ParseEmbeddedResource<EatWhitespace<Remainder>> extends ParserError<string>
    ? ParseEmbeddedResource<EatWhitespace<Remainder>>
    : // `field`
      [{ name: Name; original: Name }, EatWhitespace<Remainder>]
  : ParserError<`Expected identifier at \`${Input}\``>

/**
 * Parses an embedded resource, which is an opening `(`, followed by a sequence of
 * nodes, separated by `,`, then a closing `)`.
 *
 * Returns a tuple of ["Parsed fields", "Remainder of text"], an error,
 * or the original string input indicating that no opening `(` was found.
 */
type ParseEmbeddedResource<Input extends string> = Input extends `(${infer Remainder}`
  ? ParseNodes<EatWhitespace<Remainder>> extends [infer Fields, `${infer Remainder}`]
    ? EatWhitespace<Remainder> extends `)${infer Remainder}`
      ? Fields extends []
        ? ParserError<'Expected fields after `(`'>
        : [Fields, EatWhitespace<Remainder>]
      : ParserError<`Expected ")"`>
    : ParseNodes<EatWhitespace<Remainder>>
  : Input

/**
 * Parses a sequence of nodes, separated by `,`.
 *
 * Returns a tuple of ["Parsed fields", "Remainder of text"] or an error.
 */
type ParseNodes<Input extends string> = string extends Input
  ? GenericStringError
  : ParseNodesHelper<Input, []>

type ParseNodesHelper<Input extends string, Fields extends unknown[]> = ParseNode<Input> extends [
  infer Field,
  `${infer Remainder}`
]
  ? EatWhitespace<Remainder> extends `,${infer Remainder}`
    ? ParseNodesHelper<EatWhitespace<Remainder>, [Field, ...Fields]>
    : [[Field, ...Fields], EatWhitespace<Remainder>]
  : ParseNode<Input>

/**
 * Parses a query.
 * A query is a sequence of nodes, separated by `,`, ensuring that there is
 * no remaining input after all nodes have been parsed.
 *
 * Returns an array of parsed nodes, or an error.
 */
type ParseQuery<Query extends string> = string extends Query
  ? GenericStringError
  : ParseNodes<EatWhitespace<Query>> extends [infer Fields, `${infer Remainder}`]
  ? EatWhitespace<Remainder> extends ''
    ? Fields
    : ParserError<`Unexpected input: ${Remainder}`>
  : ParseNodes<EatWhitespace<Query>>

type GetResultHelper<
  Table extends Record<string, unknown>,
  Fields extends unknown[],
  Acc
> = Fields extends [infer R]
  ? GetResultHelper<Table, [], ConstructFieldDefinition<Table, R> & Acc>
  : Fields extends [infer R, ...infer Rest]
  ? GetResultHelper<Table, Rest, ConstructFieldDefinition<Table, R> & Acc>
  : Acc

/**
 * Constructs a type definition for an object based on a given PostgREST query.
 *
 * @param Table Record<string, unknown>.
 * @param Query Select query string literal to parse.
 */
export type GetResult<
  Table extends Record<string, unknown>,
  Query extends string
> = ParseQuery<Query> extends unknown[]
  ? GetResultHelper<Table, ParseQuery<Query>, unknown>
  : ParseQuery<Query>