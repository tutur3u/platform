import { removeAccents } from '@/utils/text-helper';
import { expect, it } from 'vitest';

it('should remove accents from a string', () => {
  expect(removeAccents('áéíóú')).toBe('aeiou');
  expect(removeAccents('àèìòù')).toBe('aeiou');
  expect(removeAccents('âêîôû')).toBe('aeiou');
  expect(removeAccents('äëïöü')).toBe('aeiou');
  expect(removeAccents('ãẽĩõũ')).toBe('aeiou');
  expect(removeAccents('āēīōū')).toBe('aeiou');
  expect(removeAccents('ăĕĭŏŭ')).toBe('aeiou');
  expect(removeAccents('ąęįų')).toBe('aeiu');
  expect(removeAccents('ç')).toBe('c');
  expect(removeAccents('ć')).toBe('c');
  expect(removeAccents('č')).toBe('c');
  expect(removeAccents('đ')).toBe('d');
  expect(removeAccents('ď')).toBe('d');
  expect(removeAccents('ñ')).toBe('n');
  expect(removeAccents('ń')).toBe('n');
  expect(removeAccents('ň')).toBe('n');
  expect(removeAccents('ø')).toBe('ø');
  expect(removeAccents('œ')).toBe('œ');
  expect(removeAccents('ß')).toBe('ß');
  expect(removeAccents('ś')).toBe('s');
  expect(removeAccents('š')).toBe('s');
  expect(removeAccents('þ')).toBe('þ');
  expect(removeAccents('ť')).toBe('t');
  expect(removeAccents('ž')).toBe('z');

  expect(removeAccents('Võ Hoàng Phúc')).toBe('Vo Hoang Phuc');
  expect(removeAccents('Nguyễn Văn A')).toBe('Nguyen Van A');
  expect(removeAccents('Trần Thị B')).toBe('Tran Thi B');
  expect(removeAccents('Phạm Văn C')).toBe('Pham Van C');
  expect(removeAccents('Hoàng Thị D')).toBe('Hoang Thi D');
  expect(removeAccents('Huỳnh Văn E')).toBe('Huynh Van E');
  expect(removeAccents('Phan Thị F')).toBe('Phan Thi F');
  expect(removeAccents('Vũ Văn G')).toBe('Vu Van G');
  expect(removeAccents('Đặng Thị H')).toBe('Dang Thi H');
  expect(removeAccents('Bùi Văn I')).toBe('Bui Van I');
  expect(removeAccents('Đỗ Thị K')).toBe('Do Thi K');
  expect(removeAccents('Hồ Văn L')).toBe('Ho Van L');
  expect(removeAccents('Ngô Thị M')).toBe('Ngo Thi M');
  expect(removeAccents('Dương Văn N')).toBe('Duong Van N');
  expect(removeAccents('Lê Thị O')).toBe('Le Thi O');
  expect(removeAccents('Phùng Văn P')).toBe('Phung Van P');
  expect(removeAccents('Đinh Thị Q')).toBe('Dinh Thi Q');
  expect(removeAccents('Lý Văn R')).toBe('Ly Van R');
  expect(removeAccents('Trịnh Thị S')).toBe('Trinh Thi S');
  expect(removeAccents('Hoàng Văn T')).toBe('Hoang Van T');
  expect(removeAccents('Phan Thị U')).toBe('Phan Thi U');
  expect(removeAccents('Vũ Văn V')).toBe('Vu Van V');
  expect(removeAccents('Đặng Thị X')).toBe('Dang Thi X');
  expect(removeAccents('Bùi Văn Y')).toBe('Bui Van Y');
  expect(removeAccents('Đỗ Thị Z')).toBe('Do Thi Z');
});

it('should remove accents from a string with mixed characters', () => {
  expect(removeAccents('áéíóúàèìòùâêîôûäëïöüãẽĩõũ')).toBe(
    'aeiouaeiouaeiouaeiouaeiou'
  );
  expect(removeAccents('āēīōūăĕĭŏŭ')).toBe('aeiouaeiou');
});

it('should remove accents from a string with special characters', () => {
  expect(removeAccents('áéíóú?àèìòù!âêîôû@äëïöü#ãẽĩõũ$')).toBe(
    'aeiou?aeiou!aeiou@aeiou#aeiou$'
  );
  expect(removeAccents('øœßśšþťž*áéíóúàèìòùâêîôû')).toBe(
    'øœßssþtz*aeiouaeiouaeiou'
  );
});

it('should remove accents from a string with numbers', () => {
  expect(removeAccents('áéíóú123àèìòù456âêîôû789')).toBe(
    'aeiou123aeiou456aeiou789'
  );
  expect(removeAccents('āēīōū123ăĕĭŏŭ456')).toBe('aeiou123aeiou456');
  expect(removeAccents('ąęįų123çćč456')).toBe('aeiu123ccc456');
});

it('should remove accents from a string with symbols', () => {
  expect(removeAccents('áéíóú@àèìòù#âêîôû$')).toBe('aeiou@aeiou#aeiou$');
  expect(removeAccents('āēīōū%ăĕĭŏŭ^')).toBe('aeiou%aeiou^');
  expect(removeAccents('ąęįų&çćč')).toBe('aeiu&ccc');
});

it('should remove accents from a string with spaces', () => {
  expect(removeAccents('áéíóú àèìòù âêîôû')).toBe('aeiou aeiou aeiou');
  expect(removeAccents('āēīōū ăĕĭŏŭ')).toBe('aeiou aeiou');
  expect(removeAccents('ąęįų çćč')).toBe('aeiu ccc');
});

it('should remove accents from a string with punctuation', () => {
  expect(removeAccents('áéíóú,àèìòù.âêîôû!')).toBe('aeiou,aeiou.aeiou!');
  expect(removeAccents('āēīōū;ăĕĭŏŭ:')).toBe('aeiou;aeiou:');
  expect(removeAccents('ąęįų?çćč!')).toBe('aeiu?ccc!');
});

it('should remove accents from a string with mixed characters and spaces', () => {
  expect(removeAccents('áéíóú àèìòù âêîôû?')).toBe('aeiou aeiou aeiou?');
  expect(removeAccents('āēīōū ăĕĭŏŭ!')).toBe('aeiou aeiou!');
  expect(removeAccents('ąęįų çćč@')).toBe('aeiu ccc@');
});

it('should remove accents from a string with mixed characters and punctuation', () => {
  expect(removeAccents('áéíóú,àèìòù.âêîôû!')).toBe('aeiou,aeiou.aeiou!');
  expect(removeAccents('āēīōū;ăĕĭŏŭ:')).toBe('aeiou;aeiou:');
  expect(removeAccents('ąęįų?çćč!')).toBe('aeiu?ccc!');
});

it('should remove accents from a string with mixed characters, spaces, and punctuation', () => {
  expect(removeAccents('áéíóú ,àèìòù .âêîôû ?')).toBe('aeiou ,aeiou .aeiou ?');
  expect(removeAccents('āēīōū ;ăĕĭŏŭ :')).toBe('aeiou ;aeiou :');
  expect(removeAccents('ąęįų ?çćč !')).toBe('aeiu ?ccc !');
});
