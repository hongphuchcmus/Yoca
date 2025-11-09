import {
  DataTable,
  DataTableSkeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@carbon/react";

interface TblHdr {
  header: string;
  key: string;
}

interface TblRw {
  id: string;
}

interface TblProps {
  loading: boolean;
  headers: TblHdr[];
  rows: TblRw[];
}

export default function Tble(
  props: TblProps,
) {
  return props.loading
    ? (
      <DataTableSkeleton
        headers={props.headers}
        showHeader={false}
        showToolbar={false}
      />
    )
    : (
      <DataTable rows={props.rows} headers={props.headers}>
        {({
          rows,
          headers,
          getTableProps,
          getHeaderProps,
          getRowProps,
          getCellProps,
        }) => (
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableHeader {...getHeaderProps({ header })}>
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow {...getRowProps({ row })}>
                  {row.cells.map((cell) => (
                    <TableCell {...getCellProps({ cell })}>
                      {cell.value}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataTable>
    );
}
