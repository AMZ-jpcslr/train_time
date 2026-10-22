package jp.maniau.widget;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Bounded JSON reader shared by Android and the plain-JDK tests. No coercions or duplicate keys. */
final class StrictJson {
    private final String text;
    private int index;
    private StrictJson(String text) { this.text = text; }
    static Object parse(String text) {
        StrictJson reader = new StrictJson(text);
        Object value = reader.value(0);
        reader.space();
        if (reader.index != text.length()) throw bad();
        return value;
    }
    private static IllegalArgumentException bad() { return new IllegalArgumentException("Invalid widget JSON"); }
    private void space() { while (index < text.length() && " \r\n\t".indexOf(text.charAt(index)) >= 0) index++; }
    private char take() { if (index >= text.length()) throw bad(); return text.charAt(index++); }
    private boolean next(char c) { space(); if (index < text.length() && text.charAt(index) == c) { index++; return true; } return false; }
    private void need(char c) { if (!next(c)) throw bad(); }
    private Object value(int depth) {
        if (depth > 4) throw bad();
        space();
        if (index >= text.length()) throw bad();
        char c = text.charAt(index);
        if (c == '"') return string();
        if (c == '{') {
            index++; Map<String, Object> map = new LinkedHashMap<>();
            if (next('}')) return map;
            do { space(); String key = string(); need(':'); if (map.containsKey(key) || map.size() >= 20) throw bad(); map.put(key, value(depth + 1)); } while (next(','));
            need('}'); return map;
        }
        if (c == '[') {
            index++; List<Object> list = new ArrayList<>();
            if (next(']')) return list;
            do { if (list.size() >= 5) throw bad(); list.add(value(depth + 1)); } while (next(','));
            need(']'); return list;
        }
        if (text.startsWith("null", index)) { index += 4; return null; }
        if (text.startsWith("true", index)) { index += 4; return Boolean.TRUE; }
        if (text.startsWith("false", index)) { index += 5; return Boolean.FALSE; }
        int start = index;
        if (c == '-') index++;
        if (index >= text.length()) throw bad();
        if (text.charAt(index) == '0') index++;
        else { if (text.charAt(index) < '1' || text.charAt(index) > '9') throw bad(); while (index < text.length() && digit(text.charAt(index))) index++; }
        if (index < text.length() && text.charAt(index) == '.') { index++; int at = index; while (index < text.length() && digit(text.charAt(index))) index++; if (at == index) throw bad(); }
        if (index < text.length() && (text.charAt(index) == 'e' || text.charAt(index) == 'E')) {
            index++; if (index < text.length() && (text.charAt(index) == '+' || text.charAt(index) == '-')) index++;
            int at = index; while (index < text.length() && digit(text.charAt(index))) index++; if (at == index) throw bad();
        }
        double number;
        try { number = Double.parseDouble(text.substring(start, index)); } catch (NumberFormatException e) { throw bad(); }
        if (!Double.isFinite(number)) throw bad();
        return number;
    }
    private static boolean digit(char c) { return c >= '0' && c <= '9'; }
    private String string() {
        if (take() != '"') throw bad();
        StringBuilder out = new StringBuilder();
        while (true) {
            char c = take();
            if (c == '"') return out.toString();
            if (c < 32) throw bad();
            if (c == '\\') {
                char escaped = take();
                switch (escaped) {
                    case '"': c = '"'; break;
                    case '\\': c = '\\'; break;
                    case '/': c = '/'; break;
                    case 'b': c = '\b'; break;
                    case 'f': c = '\f'; break;
                    case 'n': c = '\n'; break;
                    case 'r': c = '\r'; break;
                    case 't': c = '\t'; break;
                    case 'u':
                        int code = 0;
                        for (int j = 0; j < 4; j++) { int hex = Character.digit(take(), 16); if (hex < 0) throw bad(); code = code * 16 + hex; }
                        c = (char) code; break;
                    default: throw bad();
                }
            }
            out.append(c);
            if (out.length() > 1024) throw bad();
        }
    }
}
