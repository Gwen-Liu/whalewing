# 生成功能测试用的旧格式表格（Excel 97-2003 .xls，真正的 OLE 复合文档）：旧格式转新格式（TOOL-31）用。
# 2026-11-15 用 xlwt 1.3.0 生成一次，产物 legacy-sales.xls 提交进仓库；要重做时在装了 xlwt 的 Python 里运行本文件。
import os
import xlwt

book = xlwt.Workbook(encoding='utf-8')
sheet = book.add_sheet('销售')
for col, title in enumerate(['月份', '地区', '金额']):
    sheet.write(0, col, title)
rows = [('一月', '华东', 1200), ('一月', '华南', 980), ('二月', '华东', 1350)]
for row, values in enumerate(rows, start=1):
    for col, value in enumerate(values):
        sheet.write(row, col, value)
sheet.write(4, 1, '合计')
sheet.write(4, 2, xlwt.Formula('SUM(C2:C4)'))
book.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'legacy-sales.xls'))
