// Minimal recursive-descent parser/evaluator for plain arithmetic expressions
// (numbers, + - * / ^, parentheses, unary minus, a trailing "%", and sqrt()).
// Used to safely compute the formula the AI calculator-solve endpoint
// produces — evaluating a string this way (instead of `eval`/`new Function`)
// means untrusted model output can never execute arbitrary code, only this
// fixed arithmetic grammar.

export class MathExpressionError extends Error {}

type TokenType = 'number' | 'op' | 'lparen' | 'rparen' | 'ident' | 'percent';
interface Token {
  type: TokenType;
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ type: 'ident', value: ident.toLowerCase() });
      continue;
    }
    if (ch === '%') {
      tokens.push({ type: 'percent', value: '%' });
      i++;
      continue;
    }
    if ('+-*/^'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch });
      i++;
      continue;
    }
    throw new MathExpressionError(`Carácter no permitido: "${ch}"`);
  }
  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new MathExpressionError('Expresión incompleta.');
    this.pos++;
    return t;
  }

  parse(): number {
    const value = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new MathExpressionError(`Token inesperado: "${this.peek()?.value}"`);
    }
    return value;
  }

  // expression := term (('+'|'-') term)*
  private parseExpression(): number {
    let value = this.parseTerm();
    while (this.peek()?.type === 'op' && (this.peek()?.value === '+' || this.peek()?.value === '-')) {
      const op = this.consume().value;
      const rhs = this.parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  // term := power (('*'|'/') power)*
  private parseTerm(): number {
    let value = this.parsePower();
    while (this.peek()?.type === 'op' && (this.peek()?.value === '*' || this.peek()?.value === '/')) {
      const op = this.consume().value;
      const rhs = this.parsePower();
      if (op === '/') {
        if (rhs === 0) throw new MathExpressionError('División por cero.');
        value = value / rhs;
      } else {
        value = value * rhs;
      }
    }
    return value;
  }

  // power := unary ('^' power)?  (right-associative)
  private parsePower(): number {
    const base = this.parseUnary();
    if (this.peek()?.type === 'op' && this.peek()?.value === '^') {
      this.consume();
      const exponent = this.parsePower();
      return Math.pow(base, exponent);
    }
    return base;
  }

  // unary := '-' unary | postfixPercent
  private parseUnary(): number {
    if (this.peek()?.type === 'op' && this.peek()?.value === '-') {
      this.consume();
      return -this.parseUnary();
    }
    return this.parsePostfix();
  }

  // postfixPercent := primary '%'?
  private parsePostfix(): number {
    const value = this.parsePrimary();
    if (this.peek()?.type === 'percent') {
      this.consume();
      return value / 100;
    }
    return value;
  }

  // primary := NUMBER | '(' expression ')' | ident '(' expression ')'
  private parsePrimary(): number {
    const t = this.peek();
    if (!t) throw new MathExpressionError('Expresión incompleta.');

    if (t.type === 'number') {
      this.consume();
      return parseFloat(t.value);
    }

    if (t.type === 'lparen') {
      this.consume();
      const value = this.parseExpression();
      if (this.peek()?.type !== 'rparen') throw new MathExpressionError('Falta un paréntesis de cierre.');
      this.consume();
      return value;
    }

    if (t.type === 'ident') {
      const name = this.consume().value;
      if (this.peek()?.type !== 'lparen') throw new MathExpressionError(`Se esperaba "(" después de "${name}".`);
      this.consume();
      const arg = this.parseExpression();
      if (this.peek()?.type !== 'rparen') throw new MathExpressionError('Falta un paréntesis de cierre.');
      this.consume();
      switch (name) {
        case 'sqrt':
          if (arg < 0) throw new MathExpressionError('Raíz cuadrada de un número negativo.');
          return Math.sqrt(arg);
        case 'cbrt':
          return Math.cbrt(arg);
        case 'abs':
          return Math.abs(arg);
        case 'ln':
          return Math.log(arg);
        case 'log':
        case 'log10':
          return Math.log10(arg);
        default:
          throw new MathExpressionError(`Función no soportada: "${name}"`);
      }
    }

    throw new MathExpressionError(`Token inesperado: "${t.value}"`);
  }
}

/** Evaluates a plain-arithmetic expression string. Throws MathExpressionError on anything outside the supported grammar. */
export function evaluateMathExpression(expression: string): number {
  const tokens = tokenize(expression);
  if (tokens.length === 0) throw new MathExpressionError('Expresión vacía.');
  const result = new Parser(tokens).parse();
  if (!isFinite(result)) throw new MathExpressionError('El resultado no es un número válido.');
  return result;
}
